const express = require("express")
const dotenv = require("dotenv")
const path = require('path');
const axios = require("axios");
const cors = require("cors")
const mime = require("mime-types")
const multer = require('multer');

const sleep = require('util').promisify(setTimeout);
const fs = require("fs");


const storage = multer.diskStorage({
    destination: './public/uploads/images',
    filename: function (req, file, cb) {
        let ext = mime.extension(file.mimetype);
        let str = "." + ext
        cb(null, file.fieldname + '-' + Date.now() +
            str);
    }
});


dotenv.config({ path: path.resolve(__dirname + '/process.env') });

const app = express()


app.use(
    cors({
        origin: function (origin, callback) {
            if (!origin) return callback(null, true);
            if (allowedOrigins.indexOf(origin) === -1) {
                var msg =
                    "The CORS policy for this site does not " +
                    "allow access from the specified Origin.";
                return callback(new Error(msg), false);
            }
            return callback(null, true);
        }
    })
);


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


app.get("/", (req, res) => res.json({ "hello": "cool" }))


app.post("/detectText", upload.single("file"), async (req, res) => {
    var config = {
        headers: {
            "Ocp-Apim-Subscription-Key": process.env.APP_KEY,
            "Content-Type": "application/octet-stream"
        },

    };

    const dataToPrint = await readAndGetRes(req.file.path)

    console.log(dataToPrint)

    const finalAnalyzedData = printRecText(dataToPrint)

    res.send({ "data": finalAnalyzedData })

})


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
        // console.log(resp)

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

    let mappedData = ""

    for (const page in readResults) {

        const result = readResults[page];
        if (result.lines.length) {
            for (const line of result.lines) {
                mappedData += line.words.map(w => w.text).join(' ');

            }
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