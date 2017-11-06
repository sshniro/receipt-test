'use strict';

const express = require('express');
const fs = require('fs');
const util = require('util');
const mime = require('mime');
const multer = require('multer');
const upload = multer({dest: 'uploads/'});
const jsonfile = require('jsonfile');

const visionHelper = require('./helpers/vision-helper');
const storageHelper = require('./helpers/storage-helper');
const receiptProcessor = require('./receiptProcessor');

const app = express();

app.post('/upload', upload.single('image'), function (req, res, next) {
    let filename = req.file.path;
    let rename = 'uploads/' + req.file.originalname;
    let originalFileName =  req.file.originalname;
    let fileNameWithoutExtension = originalFileName.substring(0, originalFileName.lastIndexOf('.'));
    let jsonFileName = originalFileName + '.json';
    let jsonFileLocation = 'json/' + jsonFileName;

    console.log('started processing : ', originalFileName);

    if (fs.existsSync(jsonFileLocation)) {
        // Do something
        let content = fs.readFileSync(jsonFileLocation);

        receiptProcessor.processReceipt(JSON.parse(content)[0]['responses'][0], fileNameWithoutExtension).then((receipt) => {
            let htmlData = receiptProcessor.generateHtmlForReceipt(receipt, originalFileName);
            uploadResponse(res, filename, htmlData);
        });
    }else {
        // If the json file exists avoid doing vision detection
        storageHelper.checkIfFileExists(jsonFileName).then((checkRes) => {
            if(checkRes === true) {
                storageHelper.downloadJson(jsonFileName, jsonFileLocation).then((downloadRes) => {
                    let content = fs.readFileSync(jsonFileLocation);

                    receiptProcessor.processReceipt(JSON.parse(content)[0]['responses'][0], fileNameWithoutExtension).then((receipt) => {
                        let htmlData = receiptProcessor.generateHtmlForReceipt(receipt, originalFileName);
                        uploadResponse(res, filename, htmlData);
                    });
                })
            }else{
                // else upload and save the json to google storage
                fs.rename(filename, rename, function (err) {
                    storageHelper.uploadFile(rename).then(function (storageResponse) {
                        console.log(storageResponse);
                        visionHelper.getVisionText(originalFileName).then(function (visionResponse) {
                            console.log('vision api request success. proceeding to upload the json');
                            jsonfile.writeFile(jsonFileLocation, visionResponse, function (err) {
                                // console.log('error in saving json file to local file system');
                                storageHelper.uploadJsonFile(jsonFileLocation).then(() => {
                                    console.log('json uploaded');
                                    receiptProcessor.processReceipt(visionResponse[0]['responses'][0], fileNameWithoutExtension).then((receipt) => {
                                        let htmlData = receiptProcessor.generateHtmlForReceipt(receipt, originalFileName);
                                        uploadResponse(res, rename, htmlData);
                                    });
                                });
                            });
                        }).catch(function () {
                            console.log('error occurred in the vision api text extraction');
                        })
                    }).catch(function (err) {
                        console.log('error');
                    })
                });

            }
        }).catch((err) => {
            console.log('error occurred while connecting the gcp bucket');
        });
    }
});

let processReceipt = () => {

};

let uploadResponse = (res, imageFileName, data) => {
    res.writeHead(200, {
        'Content-Type': 'text/html'
    });
    res.write('<!DOCTYPE HTML><html><head><meta charset="utf-8" /></head><body>');
    res.write(form);
    // Base64 the image so we can display it on the page
    res.write('<img width=200 src="' + base64Image(imageFileName) + '"><br>');

    // Write out the JSON output of the Vision API
    // res.write(prepareHtmlStatData(data));
    res.write(data);

    // Delete file (optional)
    fs.unlinkSync(imageFileName);

    res.end('</body></html>');

};

let prepareHtmlStatData = (data) => {
    return JSON.stringify(data[0]['responses'][0]['fullTextAnnotation']['text']);
};

// Simple upload formt
let form = '<!DOCTYPE HTML><html><body>' +
    "<form method='post' action='/upload' enctype='multipart/form-data'>" +
    "<input type='file' name='image'/>" +
    "<input type='submit' /></form>" +
    '</body></html>';

app.get('/', function(req, res) {
    res.writeHead(200, {
        'Content-Type': 'text/html'
    });
    res.end(form);
});

app.listen(8080);
console.log('Server Started on port 8080');

function base64Image(src) {
    let data = fs.readFileSync(src).toString('base64');
    return util.format('data:%s;base64,%s', mime.lookup(src), data);
}