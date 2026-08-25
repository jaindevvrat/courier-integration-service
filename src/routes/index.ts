import { Router } from "express";
import { OrderController } from "../controllers/OrderController";

const router = Router();
const controller = new OrderController();

router.post("/api/v1/orders", controller.createOrder);
router.get("/api/v1/orders/:order_id/track", controller.trackOrder);
router.post("/api/v1/orders/:order_id/cancel", controller.cancelOrder);
router.post("/api/v1/orders/bulk", controller.bulkCreate);
router.get("/api/v1/orders/:order_id/history", controller.getOrderHistory);
router.get("/api/v1/couriers", controller.listCouriers);

export { router };
