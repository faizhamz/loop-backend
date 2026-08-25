import React, { useState } from 'react';
import axios from 'axios';
import RatingStars from './RatingStars';
import './ReviewModal.css';

function ReviewModal({ isOpen, onClose, order, onReviewSubmitted }) {
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rating === 0) {
      setError('Please select a rating');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const token = localStorage.getItem('loop_token');
      await axios.post(
        `${process.env.REACT_APP_API_URL}/api/reviews/submit`,
        {
          productId: selectedProduct.productId,
          orderId: order._id,
          orderItemId: selectedProduct.orderItemId,
          rating,
          comment,
          title: ''
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setSuccess(true);
      setTimeout(() => {
        onClose();
        if (onReviewSubmitted) onReviewSubmitted();
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit review');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="review-modal-overlay">
      <div className="review-modal">
        <button className="review-modal-close" onClick={onClose}>✕</button>
        
        {!selectedProduct ? (
          // Select product to review
          <>
            <h2>Select Product to Review</h2>
            <div className="review-product-list">
              {order.items.map((item, idx) => (
                <button 
                  key={idx}
                  className="review-product-item"
                  onClick={() => setSelectedProduct({
                    productId: item.productId,
                    orderItemId: item._id,
                    name: item.name,
                    image: item.image
                  })}
                >
                  {item.name} ✏️
                </button>
              ))}
            </div>
          </>
        ) : success ? (
          <div className="review-success">
            <h3>✅ Thank You!</h3>
            <p>Your review has been submitted and helps other customers.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h2>Review: {selectedProduct.name}</h2>
            
            <div className="review-rating">
              <label>Your Rating *</label>
              <RatingStars 
                rating={rating} 
                interactive={true} 
                size="large" 
                onRatingChange={setRating}
              />
            </div>
            
            <div className="review-comment">
              <label>Your Review *</label>
              <textarea
                placeholder="Share your experience with this product..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows="4"
                required
              />
            </div>
            
            {error && <div className="review-error">{error}</div>}
            
            <div className="review-actions">
              <button type="button" onClick={onClose} disabled={loading}>
                Cancel
              </button>
              <button type="submit" disabled={loading}>
                {loading ? 'Submitting...' : 'Submit Review'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default ReviewModal;