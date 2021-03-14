


const  ApiError = require( "./ApiError");


function apiErrorHandler(err, req, res, next){
   
    if (err instanceof ApiError) {
       
        res.status(err.code).json({"error": err.message ,"code":err.code})
        return;
    }

    res.status(500);
    res.json("Something went wrong")


}


module.exports = apiErrorHandler;