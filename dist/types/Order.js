"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderFlow = void 0;
var OrderFlow;
(function (OrderFlow) {
    OrderFlow[OrderFlow["QUEUE"] = 1] = "QUEUE";
    OrderFlow[OrderFlow["PREPARATION"] = 2] = "PREPARATION";
    OrderFlow[OrderFlow["DELIVERY_ROUTE"] = 3] = "DELIVERY_ROUTE";
    OrderFlow[OrderFlow["DELIVERED"] = 4] = "DELIVERED";
    OrderFlow[OrderFlow["CANCELED"] = 5] = "CANCELED";
})(OrderFlow || (exports.OrderFlow = OrderFlow = {}));
