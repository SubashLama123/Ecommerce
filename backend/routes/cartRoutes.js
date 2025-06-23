const express = require("express");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const { protect } = require("../middleware/authMiddleware");
const products = require("../data/products");

const router = express.Router();

// Helper function to get a cart by user id or guest id
const getCart = async (userId, guestId) => {
  if (userId) {
    return await Cart.findOne({ user: userId });
  } else if (guestId) {
    return await Cart.findOne({ guestId });
  }
  return null;
};

// @route   POST /api/cart
// @desc    Add a product to the cart for a guest or logged-in user
// @access  Public
router.post("/", async (req, res) => {
  const { productId, quantity, size, color, guestId, userId } = req.body;

  try {
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    let cart = await getCart(userId, guestId);

    if (cart) {
      // Check if the product already exists in the cart
      const productIndex = cart.products.findIndex(
        (p) =>
          p.productId.toString() === productId &&
          p.size === size &&
          p.color === color
      );

      if (productIndex > -1) {
        // Update quantity
        cart.products[productIndex].quantity += quantity;
      } else {
        // Add new product
        cart.products.push({
          productId,
          name: product.name,
          image: product.images[0].url,
          price: product.price,
          size,
          color,
          quantity,
        });
      }

      // Recalculate total price
      cart.totalPrice = cart.products.reduce(
        (acc, item) => acc + item.price * item.quantity,
        0
      );

      await cart.save();
      return res.status(200).json(cart);
    } else {
      // Create a new cart
      const newCart = await Cart.create({
        user: userId ? userId : undefined,
        guestId: guestId ? guestId : "guest_" + new Date().getTime(),
        products: [
          {
            productId,
            name: product.name,
            image: product.images[0].url,
            price: product.price,
            size,
            color,
            quantity,
          },
        ],
        totalPrice: product.price * quantity,
      });

      return res.status(201).json(newCart);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});
// @route PUT/api/cart
// @desc update product quantity in the cart for a guest or logged in user
// @access publicc
router.put("/", async (req, res) => {

  const { productId, quantity, size, color, guestId, userId } = req.body;

  try {
    let cart = await getCart(userId, guestId);
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    const productIndex = cart.products.findIndex(
      (p) =>
        p.productId.toString() === productId &&
        p.size === size &&
        p.color === color
    );

    if (productIndex > -1) {
      // update quantity
      if (quantity > 0) {
        cart.products[productIndex].quantity = quantity;
      } else {
        cart.products.splice(productIndex, 1); // remove product if quantity is 0
      }
      cart.totalPrice = cart.products.reduce((acc, item) => {
        return acc + Number(item.price) * item.quantity;
      }, 0);

      await cart.save();
      return res.status(200).json(cart);
    } else {
      return res.status(404).json({ message: "Product not found in cart" });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});
// @route Delette /api/cart
// @desc Remove a product from the cart
// @access public

router.delete("/", async (req, res) => {
  console.log("Received DELETE request body:", req.body);
  const { productId, size, color, guestId, userId } = req.body;
  console.log("Request query:", req.query);
  if (!productId || !userId) {
    return res.status(400).json({ message: "missing required parameters" });
  }
  try {
    let cart = await getCart(userId, guestId);
    if (!cart) return res.status(404).json({ message: "cart not found" });

    const productIndex = cart.products.findIndex(

      (p) =>
        p.productId.toString() === productId &&
        p.size === size &&
        p.color === color

    );
    if (productIndex > -1) {
      cart.products.splice(productIndex, 1);
      cart.totalPrice = cart.products.reduce(
        (acc, item) => acc + item.price * item.quantity,
        0
      );
      await cart.save();
      return res.status(200).json(cart);
    } else {
      return res.status(404).json({ message: "product not found in cart" });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "server error" })

  }
})

// @route get/api/cart
// @desc grt ;ogged in user's or guest cart
// @access public

router.get("/", async (req, res) => {
  const { userId, guestId } = req.query;
  try {
    const cart = await getCart(userId, guestId);
    if (cart) {
      res.json(cart);

    } else {
      res.status(404).json({ message: "cart not found" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "server errror" });
  }
})



// @route POST /api/cart/merge
// @desc Merge guest cart into user cart on login
// @access private
router.post("/merge", protect, async (req, res) => {
  const { guestId } = req.body;

  try {
    const guestCart = await Cart.findOne({ guestId });
    let userCart = await Cart.findOne({ user: req.user._id });

    if (guestCart) {
      if (guestCart.products.length === 0) {
        return res.status(400).json({ message: "Guest cart is empty" });
      }

      if (userCart) {
        // Merge guestCart into userCart
        guestCart.products.forEach((guestItem) => {
          const productIndex = userCart.products.findIndex(
            (item) =>
              item.productId.toString() === guestItem.productId.toString() &&
              item.size === guestItem.size &&
              item.color === guestItem.color
          );

          if (productIndex > -1) {
            userCart.products[productIndex].quantity += guestItem.quantity; // ✅ fixed "questItem" typo
          } else {
            userCart.products.push(guestItem);
          }
        });

        // Recalculate total price
        userCart.totalPrice = userCart.products.reduce(
          (acc, item) => acc + item.price * item.quantity,
          0
        );

        await userCart.save();
      } else {
        // If user has no cart, reassign guestCart to user
        guestCart.user = req.user._id;
        guestCart.guestId = undefined;
        userCart = guestCart;
        await guestCart.save();
      }

      // Delete the guest cart (only if it's different from the one reassigned)
      if (guestCart._id.toString() !== userCart._id.toString()) {
        try {
          await Cart.findOneAndDelete({ guestId });
        } catch (err) {
          console.error("Error deleting guest cart:", err);
        }
      }

      return res.status(200).json(userCart);
    } else {
      // No guest cart found
      if (userCart) {
        return res.status(200).json(userCart);
      } else {
        return res.status(404).json({ message: "Guest cart not found" });
      }
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
