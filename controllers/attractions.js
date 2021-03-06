const path = require('path');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/async');
const geocoder = require('../utils/geocoder');
const Attraction = require('../models/Attraction');
const { truncate } = require('fs');
const { createCipher } = require('crypto');


// @desc    Get All Attractions
// @route   GET /api/v2/attractions
// @access  Public
exports.getAttractions = asyncHandler(async (req, res, next) => {
   res.status(200).json(res.advancedResults);
});

// @desc    Get Single Attraction
// @route   GET /api/v2/attractions/:id
// @access  Public
exports.getAttraction = asyncHandler(async (req, res, next) => {
   try {
      let attraction = await Attraction.findById(req.params.id);
      if(!attraction) {
         return next(new ErrorResponse(`Attraction not found with ID of ${req.params.id}`, 404));
      }
      
      // increase view count

      attraction = await Attraction.findByIdAndUpdate(
         req.params.id, 
         { 
            viewCount: attraction.viewCount + 1 
         },
         {
            new: false,
            runValidators: true
         });
      
      res
         .status(200)
         .json({ success: true, data: attraction });

   } catch(error) {
      next(error);
   }
});

// @desc    Create Attraction
// @route   POST /api/v2/attractions
// @access  Private
exports.createAttraction = asyncHandler(async (req, res, next) => {
   // Add user to req.body
   req.body.user = req.user.id;

   // Check for published Attraction
   const publishedAttraction = await Attraction.findOne({ user: req.user.id });

   // if user is not admin, can only create one Attraction
   if(publishedAttraction && req.user.role !== 'admin') {
      return next(new ErrorResponse(`The user with ID ${req.user.id} has already published one Attraction`, 400));
   }

   const attraction = await Attraction.create(req.body);

   res.status(201).json({
      success: true,
      data: attraction
   });
});

// @desc    Update Attraction
// @route   PUT /api/v2/attractions/:id
// @access  Private
exports.updateAttraction = asyncHandler(async (req, res, next) => {
      let attraction = await Attraction.findById(req.params.id);

      // check for attraction
      if(!attraction) {
         return next(new ErrorResponse(`Attraction not found with ID of ${req.params.id}`, 404));
      }

      // Make sure user has proper permissions
      if(attraction.user.toString() !== req.user.id && req.user.role !== 'admin'){
         return next(new ErrorResponse(`User ${req.user.id} is not authorized to update this attraction`, 404));
      }

      // Update
      attraction = await Attraction.findByIdAndUpdate(req.params.id, req.body, {
         new: true,
         runValidators: true
      });

      res
         .status(200)
         .json({ success: true, data: attraction });   
});

// @desc    Delete Attraction
// @route   DELETE /api/v2/attractions/:id
// @access  Private
exports.deleteAttraction = asyncHandler(async (req, res, next) => {
      const attraction = await Attraction.findById(req.params.id);

      // Make sure attraction exists
      if(!attraction) {
         return next(new ErrorResponse(`Attraction not found with ID of ${req.params.id}`, 404));
      }

      // Make sure user has proper permissions
      if(attraction.user.toString() !== req.user.id && req.user.role !== 'admin'){
         return next(new ErrorResponse(`User ${req.user.id} is not authorized to update this attraction`, 404));
      }

      attraction.remove();
      res
         .status(200)
         .json({ success: true, data: {} });   
});

// @desc    Get Attractiosns within radious
// @route   GET /api/v2/attractions/radius/:zipcode/:distance
// @access  Public
exports.getAttractionsInRadius = asyncHandler(async (req, res, next) => {
   const { zipcode, distance } = req.params;
   
   // Get lat/lng from geocoder
   const loc = await geocoder.geocode(zipcode);
   const lat = await loc[0].latitude;
   const lng = await loc[0].longitude;

   // Calc radius in radians
   // Divide distance by radius of earth
   // Earth radius 3,963 mi / 6,378 km
   const radius = distance / 3963;

   const attractions = await Attraction.find({
      location: { $geoWithin: { $centerSphere: [ [ lng, lat ], radius ] } }
   });

   res.status(200).json({
      success: true,
      count: attractions.length,
      data: attractions
   });
});

// @desc    Upload photo
// @route   PUT /api/v2/attractions/:id/photo
// @access  Private
exports.attractionPhotoUpload = asyncHandler(async (req, res, next) => {
   const attraction = await Attraction.findById(req.params.id);
   if(!attraction) {
      return next(new ErrorResponse(`Attraction not found with ID of ${req.params.id}`, 404));
   }

   // Make sure user has proper permissions
   
   if(attraction.user.toString() !== req.user._id.toString() && req.user.role !== 'admin'){
      return next(new ErrorResponse(`User ${req.user.id} is not authorized to add a photo to this attraction`, 404));
   }
   
   if(!req.files) {
      return next(
         new ErrorResponse(`Please upload a file`, 400)
      );
   }
   const file = req.files.file;

   // Image validation
   if(!file.mimetype.startsWith('image')) {
      return next(new ErrorResponse('Please upload an image file.', 400))
   }

   // Check file size
   if(file.size > process.env.MAX_FILE_UPLOAD) {
      return next(new ErrorResponse(`Please upload an image file size less than ${process.env.MAX_FILE_UPLOAD}.`, 400))
   }


   let photos = attraction.photos;

   console.log("photos[0]", photos[0]);

   photos = photos? photos.length === 1 && photos[0] === 'no-photo.jpg'? [] : photos: [];

   // Create custom filename
   file.name = `photo_${attraction._id}_${photos.length+1}${path.parse(file.name).ext}`;

   // Move to uploads folder
   file.mv(`${process.env.FILE_UPLOAD_PATH}/${file.name}`, async err => {
      if(err) {
         console.error(err);
         return next(
            new ErrorResponse(`Problem with file upload`, 500)
         );
      }
   
   // check if photos array is default array or empty. if the value is default array or undefined, set it to []
   // add photo

   await Attraction.findByIdAndUpdate(req.params.id, { photos: [...photos, file.name] });

   res.status(200).json({
      success: true,
      data: file.name
   })
   });
});

// @desc    Like attraction
// @route   PUT /api/v2/attractions/like/:attraction_id
// @access  Private
exports.likeAttraction = asyncHandler(async (req, res, next) => {
   let attraction = await Attraction.findById(req.params.id);

   // check for attraction
   if(!attraction) {
      return next(new ErrorResponse(`Attraction not found with ID of ${req.params.id}`, 404));
   }

   // Check if the post has already been liked
   if(attraction.likes.filter(like => like.toString() === req.user._id.toString()).length > 0) {
      return next(new ErrorResponse(`Attraction already liked`, 404));
   }

   // Update
   attraction = await Attraction
      .findByIdAndUpdate(
         req.params.id, 
         { likes: [...attraction.likes, req.user._id]},
         {
            new: true,
            runValidators: true
         });

   res
      .status(200)
      .json({ success: true, data: attraction.likes });   
});

// @desc    Bookmark attraction
// @route   PUT /api/v2/attractions/bookmark/:attraction_id
// @access  Private
exports.bookmarkAttraction = asyncHandler(async (req, res, next) => {
   let attraction = await Attraction.findById(req.params.id);

   // check for attraction
   if(!attraction) {
      return next(new ErrorResponse(`Attraction not found with ID of ${req.params.id}`, 404));
   }

   // Check if the post has already been bookmarked
   if(attraction.bookmarks.filter(bookmark => bookmark.toString() === req.user._id.toString()).length > 0) {
      return next(new ErrorResponse(`Attraction already bookmarked`, 404));
   }

   // Update
   attraction = await Attraction
      .findByIdAndUpdate(
         req.params.id, 
         { bookmarks: [...attraction.bookmarks, req.user._id]},
         {
            new: true,
            runValidators: true
         });

   res
      .status(200)
      .json({ success: true, data: attraction.bookmarks });   
});

// @desc    UnLike attraction
// @route   PUT /api/v2/attractions/unlike/:attraction_id
// @access  Private
exports.unLikeAttraction = asyncHandler(async (req, res, next) => {
   let attraction = await Attraction.findById(req.params.id);

   // check for attraction
   if(!attraction) {
      return next(new ErrorResponse(`Attraction not found with ID of ${req.params.id}`, 404));
   }

   // Check if the post has been liked
   if(attraction.likes.find(like => like.toString() === req.user._id.toString()) === undefined) {
      return next(new ErrorResponse(`Attraction not liked`, 404));
   }

   // Update
   attraction = await Attraction
      .findByIdAndUpdate(
         req.params.id, 
         {
            likes: attraction.likes.filter(
               like => like.toString() !== req.user._id.toString()
            )
         },
         {
            new: true,
            runValidators: true
         });

   res
      .status(200)
      .json({ success: true, data: attraction.likes });   
});

// @desc    UnBookmark attraction
// @route   PUT /api/v2/attractions/unbookmark/:attraction_id
// @access  Private
exports.unBookmarkAttraction = asyncHandler(async (req, res, next) => {
   let attraction = await Attraction.findById(req.params.id);

   // check for attraction
   if(!attraction) {
      return next(new ErrorResponse(`Attraction not found with ID of ${req.params.id}`, 404));
   }

   // Check if the post has been bookmarked
   if(attraction.bookmarks.find(bookmark => bookmark.toString() === req.user._id.toString()) === undefined) {
      return next(new ErrorResponse(`Attraction not bookmarked`, 404));
   }

   // Update
   attraction = await Attraction
      .findByIdAndUpdate(
         req.params.id, 
         { bookmarks: attraction.bookmarks.filter(
            bookmark => bookmark.toString() !== req.user._id.toString())},
         {
            new: true,
            runValidators: true
         });

   res
      .status(200)
      .json({ success: true, data: attraction.bookmarks });   
});