const express = require("express")
const dotenv = require("dotenv")
const path = require('path');
const axios = require("axios");
const cors = require("cors")
const mime = require("mime-types")
const multer = require('multer');
const sleep = require('util').promisify(setTimeout);
const fs = require("fs");
const SpotifyWebApi = require('spotify-web-api-node');
const apiErrorHandler = require('./error/api-error-handler')
const ApiError = require("./error/ApiError");

const to = require('await-to-js').default;


dotenv.config({ path: path.resolve(__dirname + '/process.env') });


//Spotify initialization
const clientId = process.env.SPOTIFY_CLIENT_KEY;
const secretKey = process.env.SPOTIFY_CLIENT_SECRET;
const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
const scopes = ['user-read-private', 'user-read-email', "playlist-modify-private"];



var spotifyApi = new SpotifyWebApi({
    redirectUri: redirectUri,
    clientId: clientId,
    clientSecret: secretKey,
});


//multer storage
const storage = multer.diskStorage({
    destination: './public/uploads/images',
    filename: function (req, file, cb) {
        let ext = mime.extension(file.mimetype);
        let str = "." + ext
        cb(null, file.fieldname + '-' + Date.now() +
            str);
    }
});

const upload = multer({
    storage: storage,
    limits: { fieldSize: 10 * 1024 * 1024 }
});

// const allowedOrigins = ["http://localhost:3000", "http://localhost:5000"];



const app = express()

app.use(cors())
app.use(express.json())

app.use(express.urlencoded({ extended: true }))



const PORT = process.env.PORT;
const APP_KEY = process.env.APP_KEY
const azure_url = "https://eastus.api.cognitive.microsoft.com/vision/v3.1/read/analyze"
let tokenExpirationEpoch;



app.get("/", (req, res) => res.json({ "hello": "cool" }))


app.post("/detectText", upload.single("file"), async (req, res, next) => {
    let err, ocrData, finalAnalyzedData;

    try {
        const headers = {
            "Authorization": `Bearer ${spotifyApi.getAccessToken()}`,
            "Content-Type": "application/json"
        }

        if (req.file === undefined || null) throw new ApiError(400, "No file present");
        [err, ocrData] = await to(readAndGetRes(req.file.path));

        if (err) throw new ApiError(err.code, err.message);

        if (!err) {

            finalAnalyzedData = printRecText(ocrData)
        }

        if(finalAnalyzedData.length===0) throw new ApiError(500,"Bad image")

        let uriArr = [];
        let generatedName = finalAnalyzedData.length > 1 ? `${finalAnalyzedData[0].split(req.body.separator)[0]},${finalAnalyzedData[1].split(req.body.separator)[0]}and friends` : `${finalAnalyzedData[0].split(req.body.separator)[0]} song`
        let searchres, searcherr;
        for (song of finalAnalyzedData) {

            let eachSong = song.split(req.body.separator)
            let artistName, songName;

 
            if (req.body.leftSide === "Artist") {
                artistName = eachSong[0]
                songName = eachSong[1]
            } else {
                artistName = eachSong[1]
                songName = eachSong[0]
            }

            let searchQuery = encodeURI(`track:${songName}+artist:${artistName}`)


            try {
                [searcherr, searchres] = await to(axios.get(`https://api.spotify.com/v1/search?q=${searchQuery}&type=track`, {
                    headers: headers
                }))
            } catch (error) {
                console.log('error')
            }

            if (searcherr) throw new ApiError(searcherr.response.status, searcherr.response.statusText)

            let songsResponse = searchres.data.tracks.items;
            if (songsResponse.length > 0) {
                uriArr.push(songsResponse[0].uri)
            }

        }


        let playlistName = req.body.playlistName == "" ? generatedName : req.body.playlistName;

      
            const [createErr, makePlaylist] = await to(spotifyApi.createPlaylist(playlistName, { 'public': false }))
            if (createErr) throw new ApiError(createErr.response.status, createErr.response.statusText)

            const [addErr, addSongsToPlaylist] = await to(spotifyApi.addTracksToPlaylist(makePlaylist.body.id, uriArr))
            if (addErr) throw new ApiError(createErr.response.status, createErr.response.statusText)

            const [playListUrlErr, playListUrl] = await to(spotifyApi.getPlaylist(makePlaylist.body.id))
            if (playListUrlErr) throw new ApiError(createErr.response.status, createErr.response.statusText)

            res.send({ "data": { "url": playListUrl.body.external_urls.spotify, "name": playListUrl.body.name } })


    }

    catch (err) {
        console.log(err)
        next(err);
        return;
    }

})

app.get("/spotifyLogin", (req, res) => {
    res.redirect(spotifyApi.createAuthorizeURL(scopes))

});


app.get("/callback", (req, res) => {
    console.log("i came here")
    const error = req.query.error;
    const code = req.query.code;
    const state = req.query.state;

    if (error) {
        console.error('Callback Error:', error);
        res.send(`Callback Error: ${error}`);
        return;
    }


    spotifyApi.authorizationCodeGrant(code).then(
        function (data) {
            spotifyApi.setAccessToken(data.body['access_token']);
            spotifyApi.setRefreshToken(data.body['refresh_token']);
            tokenExpirationEpoch =
                new Date().getTime() / 1000 + data.body['expires_in'];
            console.log(
                'Retrieved token. It expires in ' +
                Math.floor(tokenExpirationEpoch - new Date().getTime() / 1000) +
                ' seconds!'
            );
        },
        function (err) {
            console.log(
                'Something went wrong when retrieving the access token!',
                err.message
            );
        }
    );


    res.redirect("http://localhost:5000")
});

let numberOfTimesUpdated = 0;

const tokenFn = () => setInterval(function () {
    console.log(
        'Time left: ' +
        Math.floor(tokenExpirationEpoch - new Date().getTime() / 1000) +
        ' seconds left!'
    );

    if (++numberOfTimesUpdated > 5) {
        clearInterval(this);
        spotifyApi.refreshAccessToken().then(
            function (data) {
                tokenExpirationEpoch =
                    new Date().getTime() / 1000 + data.body['expires_in'];
                console.log(
                    'Refreshed token. It now expires in ' +
                    Math.floor(tokenExpirationEpoch - new Date().getTime() / 1000) +
                    ' seconds!'
                );
            },
            function (err) {
                next(ApiError.refreshToken("Not authorized"))
                console.log('Could not refresh the token!', err.message);
            }
        );
    }
}, 1000);





const readAndGetRes = async (filePath) => {
    var config = {
        headers: {
            "Ocp-Apim-Subscription-Key": process.env.APP_KEY,
            "Content-Type": "application/octet-stream"
        },

    };

    try {
        let resp, err;
        let fileStream = fs.createReadStream(filePath);
        [err, resp] = await to(axios.post(azure_url, fileStream, config))
        fs.promises.unlink(filePath)

        if (err) throw new ApiError(err.response.status, err.response.data.error.message)

        if (resp.status === 202) {
            let operationUrl = resp.headers['operation-location'];
            while (true) {

                resp = await axios.get(operationUrl, config)
                if (resp.data.status === "succeeded") {
                    console.log("success")
                    break;
                }
                if (resp.status === "failed") {

                    console.log("failed")
                    throw ApiError.internal("Failed,something went wrong")

                }
                await sleep(1000);

            }
            return resp.data.analyzeResult.readResults;

        }

    } catch (e) {
        console.log(e)
        throw new ApiError(e.code, e.message)

    }






}


const printRecText = (readResults) => {

    let mappedData = [];

    for (const page in readResults) {

        const result = readResults[page];
        if (result.lines.length) {
            for (const line of result.lines) {
                mappedData.push(line.words.map(w => w.text).join(' '));

            }
            return mappedData;

        }
        else {
            return mappedData;
        }
    }
}


app.listen(PORT, () => console.log(`Server running on port ${APP_KEY}`));

app.use(apiErrorHandler);
