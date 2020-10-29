const express = require('express');
const {
   getAttractions,
   getAttraction,
   createAttraction,
   updateAttraction,
   deleteAttraction,
   getAttractionsInRadius,
   attractionPhotoUpload
} = require('../controllers/attractions');

const Attraction = require('../models/Attraction');

// Takes in the model and any populate
const advancedResults = require('../middleware/advancedResults');

// Include other resource routers
const productRouter = require('./products');

const router = express.Router();

const { protect, authorize } = require('../middleware/auth');

// Re-route into other resource routers
router.use('/:attractionId/products', productRouter);

router.route('/radius/:zipcode/:distance')
   .get(getAttractionsInRadius);

router
   .route('/:id/photos')
   .put(protect, authorize('publisher', 'admin'), attractionPhotoUpload);

router
   .route('/')
   .get(advancedResults(Attraction, 'products'), getAttractions)
   .post(protect, authorize('publisher', 'admin'), createAttraction);

router
   .route('/:id')
   .get(getAttraction)
   .put(protect, authorize('publisher', 'admin'), updateAttraction)
   .delete(protect, authorize('publisher', 'admin'), deleteAttraction);

module.exports = router;