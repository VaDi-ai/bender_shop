export declare const ClientSource: {
    readonly avito: "avito";
    readonly instagram: "instagram";
    readonly telegram: "telegram";
    readonly shop: "shop";
};
export type ClientSource = (typeof ClientSource)[keyof typeof ClientSource];
export declare const MessageDirection: {
    readonly in: "in";
    readonly out: "out";
};
export type MessageDirection = (typeof MessageDirection)[keyof typeof MessageDirection];
export declare const TaskStatus: {
    readonly pending: "pending";
    readonly done: "done";
    readonly cancelled: "cancelled";
    readonly failed: "failed";
};
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];
export declare const TemplateType: {
    readonly followup: "followup";
    readonly offer: "offer";
    readonly reactivation: "reactivation";
    readonly announcement: "announcement";
};
export type TemplateType = (typeof TemplateType)[keyof typeof TemplateType];
export declare const ReservationStatus: {
    readonly active: "active";
    readonly cancelled: "cancelled";
    readonly completed: "completed";
};
export type ReservationStatus = (typeof ReservationStatus)[keyof typeof ReservationStatus];
export declare const StockMovementType: {
    readonly in: "in";
    readonly out: "out";
    readonly reserve: "reserve";
    readonly sale: "sale";
};
export type StockMovementType = (typeof StockMovementType)[keyof typeof StockMovementType];
export declare const OrderStatus: {
    readonly new: "new";
    readonly processing: "processing";
    readonly completed: "completed";
    readonly cancelled: "cancelled";
};
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];
export declare const OrderPayment: {
    readonly cash: "cash";
    readonly card: "card";
    readonly transfer: "transfer";
    readonly crm: "crm";
};
export type OrderPayment = (typeof OrderPayment)[keyof typeof OrderPayment];
//# sourceMappingURL=enums.d.ts.map