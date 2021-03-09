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
const { query } = require("express");

const scopes = ['user-read-private', 'user-read-email', "playlist-modify-private"];
const redirectUri = 'http://localhost:3000/callback';


dotenv.config({ path: path.resolve(__dirname + '/process.env') });


const clientId = process.env.SPOTIFY_CLIENT_KEY;
const secretKey = process.env.SPOTIFY_CLIENT_SECRET;

var spotifyApi = new SpotifyWebApi({
    redirectUri: redirectUri,
    clientId: clientId,
    clientSecret: secretKey,
});



const storage = multer.diskStorage({
    destination: './public/uploads/images',
    filename: function (req, file, cb) {
        let ext = mime.extension(file.mimetype);
        let str = "." + ext
        cb(null, file.fieldname + '-' + Date.now() +
            str);
    }
});



const app = express()


// app.use(
//     cors({
//         origin: function (origin, callback) {
//             if (!origin) return callback(null, true);
//             if (allowedOrigins.indexOf(origin) === -1) {
//                 var msg =
//                     "The CORS policy for this site does not " +
//                     "allow access from the specified Origin.";
//                 return callback(new Error(msg), false);
//             }
//             return callback(null, true);
//         }
//     })
// );

app.use(cors())


const upload = multer({
    storage: storage,
    limits: { fieldSize: 10 * 1024 * 1024 }
});


const allowedOrigins = ["http://localhost:3000", "http://localhost:5000"];

app.use(express.json())
app.use(express.urlencoded({ extended: true }))


const PORT = 3000;
const APP_KEY = process.env.APP_KEY
const azure_url = "https://eastus.api.cognitive.microsoft.com/vision/v3.1/read/analyze"

let tokenExpirationEpoch;



app.get("/", (req, res) => res.json({ "hello": "cool" }))


app.post("/detectText", upload.single("file"), async (req, res) => {
    var config = {
        headers: {
            "Ocp-Apim-Subscription-Key": process.env.APP_KEY,
            "Content-Type": "application/octet-stream"
        },

    };


    const dataToPrint = await readAndGetRes(req.file.path)
    const finalAnalyzedData = printRecText(dataToPrint)

    let uriArr = [];


    for (song of finalAnalyzedData) {
        let eachSong = song.split("-")
        let artistName = eachSong[0]
        let songName = eachSong[1]
        let searchQuery= encodeURI(`track:${songName}+artist:${artistName}`)
       
        let searchres = await axios.get(`https://api.spotify.com/v1/search?q=${searchQuery}&type=track`,{headers:{
            "Authorization":`Bearer ${spotifyApi.getAccessToken()}`,
            "Content-Type":"application/json"
        }
        })

        let songsResponse = searchres.data.tracks.items;
        if (songsResponse.length>0){
            uriArr.push(songsResponse[0].uri)
        }

    } 

    const makePlaylist = await spotifyApi.createPlaylist(req.body.playlistName,{'public':false})
    const addSongsToPlaylist = await spotifyApi.addTracksToPlaylist(makePlaylist.body.id,uriArr)
    const playListUrl = await spotifyApi.getPlaylist(makePlaylist.body.id)

    res.send({ "data": playListUrl.body.external_urls.spotify })

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


    // First retrieve an access token
    spotifyApi.authorizationCodeGrant(code).then(
        function (data) {
            // Set the access token and refresh token
            spotifyApi.setAccessToken(data.body['access_token']);
            spotifyApi.setRefreshToken(data.body['refresh_token']);

            // Save the amount of seconds until the access token expired
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

    // spotifyApi
    //     .authorizationCodeGrant(code)
    //     .then(data => {
    //         const access_token = data.body['access_token'];
    //         const refresh_token = data.body['refresh_token'];
    //         const expires_in = data.body['expires_in'];

    //         spotifyApi.setAccessToken(access_token);
    //         spotifyApi.setRefreshToken(refresh_token);

    //         console.log('access_token:', access_token);
    //         console.log('refresh_token:', refresh_token);

    //         console.log(
    //             `Sucessfully retreived access token. Expires in ${expires_in} s.`
    //         );
    //         // res.send("Success")
                
           
            res.redirect("http://localhost:5000")
});

let numberOfTimesUpdated = 0;

setInterval(function () {
    console.log(
        'Time left: ' +
        Math.floor(tokenExpirationEpoch - new Date().getTime() / 1000) +
        ' seconds left!'
    );

    // OK, we need to refresh the token. Stop printing and refresh.
    if (++numberOfTimesUpdated > 5) {
        clearInterval(this);

        // Refresh token and print the new time to expiration.
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
    let fileStream = fs.createReadStream(filePath);
    let resp = await axios.post(azure_url, fileStream, config)
    fs.promises.unlink(filePath)

    let operationUrl = resp.headers['operation-location'];
    while (true) {

        resp = await axios.get(operationUrl, config)
        if (resp.data.status === "succeeded") {
            console.log("success")
            break;
        }
        if (resp.status === "failed") {
            console.log("failed")
            break;
        }
        await sleep(1000);

    }


    return resp.data.analyzeResult.readResults;

}







const printRecText = (readResults) => {

    let mappedData = [];

    for (const page in readResults) {

        const result = readResults[page];
        if (result.lines.length) {
            for (const line of result.lines) {
                mappedData.push(line.words.map(w => w.text).join(' '));

            }
            console.log(mappedData)
            return mappedData;

        }
        else {
            return mappedData;
        }
    }
}






app.listen(PORT, () => console.log(`Server running on port ${APP_KEY}`));



















// const express = require("express")
// const dotenv = require("dotenv")
// const path = require('path');
// const axios = require("axios");
// const cors = require("cors")
// const { parse, stringify } = require('flatted');



// const { config } = require("process");
// const { read } = require("fs");
// const { waitForDebugger } = require("inspector");
// dotenv.config({ path: path.resolve(__dirname + '/process.env') });


// const app = express()


// const allowedOrigins = ["http://localhost:3000", "http://localhost:5000"];

// app.use(
//     cors({
//         origin: function (origin, callback) {
//             if (!origin) return callback(null, true);
//             if (allowedOrigins.indexOf(origin) === -1) {
//                 var msg =
//                     "The CORS policy for this site does not " +
//                     "allow access from the specified Origin.";
//                 return callback(new Error(msg), false);
//             }
//             return callback(null, true);
//         }
//     })
// );
// app.use(express.json())


// const PORT = 3000;
// const APP_KEY = process.env.APP_KEY

// const azure_url = "https://eastus.api.cognitive.microsoft.com/vision/v3.0-preview/read/analyze"
// // const analyzeResults = "https://eastus.api.cognitive.microsoft.com/vision/v3.0-preview/read/analyzeResults/"

// app.get("/", (req, res) => res.json({ "hello": "cool" }))

// app.post("/detectText", async (req, res) => {

//     var config = {
//         headers: { 'Content-Type': 'application/json', "Ocp-Apim-Subscription-Key": process.env.APP_KEY },

//     };
//     console.log(req.body)
//     // console.log(req.body)
//     try {
//         const resp = await axios.post(azure_url, req.body, config)
//         console.log(resp)
//         const readRes = await getFinalRes(resp.headers['operation-location'], res);
//         // const final =  printRecText(readRes, res)
//         // console.log(final)
//         // console.log(printRecText(readRes, res))
//         const fin = printRecText(readRes)
//         res.send({ "data": fin })
//     } catch (err) {
//         console.log(err.data);
//     }

// })


// // app.get("/results",(req,res) => {

// // })

// const getFinalRes = async (header, res) => {
//     var config = {
//         headers: { 'Content-Type': 'application/json', "Ocp-Apim-Subscription-Key": process.env.APP_KEY },

//     };
//     let response = await axios.get(header, config)

//     while (response["status"] !== "succeeded") {
//         await sleep(1500)
//         response = await response.data;

//     }
//     // console.log(`"readResults":${response.analyzeResul}`)
//     return response.analyzeResult;
// }

// function sleep(ms) {
//     return new Promise((resolve) => {
//         setTimeout(resolve, ms);
//     });
// }


// const printRecText = (readResults) => {
//     console.log(`"readResults":${readResults}`)
//     let mappedData = ""

//     readResults = readResults.readResults
//     for (const page in readResults) {
//         // console.log(page);
//         // if (readResults.length > 1) {
//         //     console.log(`==== Page: ${page}`);
//         // }
//         const result = readResults[page];
//         if (result.lines.length) {
//             for (const line of result.lines) {
//                 mappedData += line.words.map(w => w.text).join(' ');

//                 // res.send("hello")
//                 // res.send({ "data": line.words.map(w => w.text).join(' ')})
//             }
//             return mappedData;

//         }
//         else {
//             console.log('No recognized text.');
//             return mappedData;
//         }
//     }
// }






// app.listen(PORT, () => console.log(`Server running on port ${APP_KEY}`));