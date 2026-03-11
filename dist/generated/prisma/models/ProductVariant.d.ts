import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace";
/**
 * Model ProductVariant
 *
 */
export type ProductVariantModel = runtime.Types.Result.DefaultSelection<Prisma.$ProductVariantPayload>;
export type AggregateProductVariant = {
    _count: ProductVariantCountAggregateOutputType | null;
    _avg: ProductVariantAvgAggregateOutputType | null;
    _sum: ProductVariantSumAggregateOutputType | null;
    _min: ProductVariantMinAggregateOutputType | null;
    _max: ProductVariantMaxAggregateOutputType | null;
};
export type ProductVariantAvgAggregateOutputType = {
    id: number | null;
    productId: number | null;
    price: runtime.Decimal | null;
    quantity: number | null;
    reserved: number | null;
};
export type ProductVariantSumAggregateOutputType = {
    id: number | null;
    productId: number | null;
    price: runtime.Decimal | null;
    quantity: number | null;
    reserved: number | null;
};
export type ProductVariantMinAggregateOutputType = {
    id: number | null;
    productId: number | null;
    sku: string | null;
    price: runtime.Decimal | null;
    quantity: number | null;
    reserved: number | null;
    inStock: boolean | null;
    createdAt: Date | null;
};
export type ProductVariantMaxAggregateOutputType = {
    id: number | null;
    productId: number | null;
    sku: string | null;
    price: runtime.Decimal | null;
    quantity: number | null;
    reserved: number | null;
    inStock: boolean | null;
    createdAt: Date | null;
};
export type ProductVariantCountAggregateOutputType = {
    id: number;
    productId: number;
    sku: number;
    price: number;
    quantity: number;
    reserved: number;
    inStock: number;
    attributes: number;
    photos: number;
    createdAt: number;
    _all: number;
};
export type ProductVariantAvgAggregateInputType = {
    id?: true;
    productId?: true;
    price?: true;
    quantity?: true;
    reserved?: true;
};
export type ProductVariantSumAggregateInputType = {
    id?: true;
    productId?: true;
    price?: true;
    quantity?: true;
    reserved?: true;
};
export type ProductVariantMinAggregateInputType = {
    id?: true;
    productId?: true;
    sku?: true;
    price?: true;
    quantity?: true;
    reserved?: true;
    inStock?: true;
    createdAt?: true;
};
export type ProductVariantMaxAggregateInputType = {
    id?: true;
    productId?: true;
    sku?: true;
    price?: true;
    quantity?: true;
    reserved?: true;
    inStock?: true;
    createdAt?: true;
};
export type ProductVariantCountAggregateInputType = {
    id?: true;
    productId?: true;
    sku?: true;
    price?: true;
    quantity?: true;
    reserved?: true;
    inStock?: true;
    attributes?: true;
    photos?: true;
    createdAt?: true;
    _all?: true;
};
export type ProductVariantAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which ProductVariant to aggregate.
     */
    where?: Prisma.ProductVariantWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of ProductVariants to fetch.
     */
    orderBy?: Prisma.ProductVariantOrderByWithRelationInput | Prisma.ProductVariantOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: Prisma.ProductVariantWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` ProductVariants from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` ProductVariants.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned ProductVariants
    **/
    _count?: true | ProductVariantCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to average
    **/
    _avg?: ProductVariantAvgAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to sum
    **/
    _sum?: ProductVariantSumAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
    **/
    _min?: ProductVariantMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
    **/
    _max?: ProductVariantMaxAggregateInputType;
};
export type GetProductVariantAggregateType<T extends ProductVariantAggregateArgs> = {
    [P in keyof T & keyof AggregateProductVariant]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateProductVariant[P]> : Prisma.GetScalarType<T[P], AggregateProductVariant[P]>;
};
export type ProductVariantGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.ProductVariantWhereInput;
    orderBy?: Prisma.ProductVariantOrderByWithAggregationInput | Prisma.ProductVariantOrderByWithAggregationInput[];
    by: Prisma.ProductVariantScalarFieldEnum[] | Prisma.ProductVariantScalarFieldEnum;
    having?: Prisma.ProductVariantScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: ProductVariantCountAggregateInputType | true;
    _avg?: ProductVariantAvgAggregateInputType;
    _sum?: ProductVariantSumAggregateInputType;
    _min?: ProductVariantMinAggregateInputType;
    _max?: ProductVariantMaxAggregateInputType;
};
export type ProductVariantGroupByOutputType = {
    id: number;
    productId: number;
    sku: string;
    price: runtime.Decimal;
    quantity: number;
    reserved: number;
    inStock: boolean;
    attributes: runtime.JsonValue;
    photos: string[];
    createdAt: Date;
    _count: ProductVariantCountAggregateOutputType | null;
    _avg: ProductVariantAvgAggregateOutputType | null;
    _sum: ProductVariantSumAggregateOutputType | null;
    _min: ProductVariantMinAggregateOutputType | null;
    _max: ProductVariantMaxAggregateOutputType | null;
};
type GetProductVariantGroupByPayload<T extends ProductVariantGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<ProductVariantGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof ProductVariantGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], ProductVariantGroupByOutputType[P]> : Prisma.GetScalarType<T[P], ProductVariantGroupByOutputType[P]>;
}>>;
export type ProductVariantWhereInput = {
    AND?: Prisma.ProductVariantWhereInput | Prisma.ProductVariantWhereInput[];
    OR?: Prisma.ProductVariantWhereInput[];
    NOT?: Prisma.ProductVariantWhereInput | Prisma.ProductVariantWhereInput[];
    id?: Prisma.IntFilter<"ProductVariant"> | number;
    productId?: Prisma.IntFilter<"ProductVariant"> | number;
    sku?: Prisma.StringFilter<"ProductVariant"> | string;
    price?: Prisma.DecimalFilter<"ProductVariant"> | runtime.Decimal | runtime.DecimalJsLike | number | string;
    quantity?: Prisma.IntFilter<"ProductVariant"> | number;
    reserved?: Prisma.IntFilter<"ProductVariant"> | number;
    inStock?: Prisma.BoolFilter<"ProductVariant"> | boolean;
    attributes?: Prisma.JsonFilter<"ProductVariant">;
    photos?: Prisma.StringNullableListFilter<"ProductVariant">;
    createdAt?: Prisma.DateTimeFilter<"ProductVariant"> | Date | string;
    product?: Prisma.XOR<Prisma.ProductScalarRelationFilter, Prisma.ProductWhereInput>;
    movements?: Prisma.StockMovementListRelationFilter;
    promotionPrices?: Prisma.PromotionPriceListRelationFilter;
    priceChanges?: Prisma.PriceChangeListRelationFilter;
};
export type ProductVariantOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    productId?: Prisma.SortOrder;
    sku?: Prisma.SortOrder;
    price?: Prisma.SortOrder;
    quantity?: Prisma.SortOrder;
    reserved?: Prisma.SortOrder;
    inStock?: Prisma.SortOrder;
    attributes?: Prisma.SortOrder;
    photos?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    product?: Prisma.ProductOrderByWithRelationInput;
    movements?: Prisma.StockMovementOrderByRelationAggregateInput;
    promotionPrices?: Prisma.PromotionPriceOrderByRelationAggregateInput;
    priceChanges?: Prisma.PriceChangeOrderByRelationAggregateInput;
};
export type ProductVariantWhereUniqueInput = Prisma.AtLeast<{
    id?: number;
    sku?: string;
    AND?: Prisma.ProductVariantWhereInput | Prisma.ProductVariantWhereInput[];
    OR?: Prisma.ProductVariantWhereInput[];
    NOT?: Prisma.ProductVariantWhereInput | Prisma.ProductVariantWhereInput[];
    productId?: Prisma.IntFilter<"ProductVariant"> | number;
    price?: Prisma.DecimalFilter<"ProductVariant"> | runtime.Decimal | runtime.DecimalJsLike | number | string;
    quantity?: Prisma.IntFilter<"ProductVariant"> | number;
    reserved?: Prisma.IntFilter<"ProductVariant"> | number;
    inStock?: Prisma.BoolFilter<"ProductVariant"> | boolean;
    attributes?: Prisma.JsonFilter<"ProductVariant">;
    photos?: Prisma.StringNullableListFilter<"ProductVariant">;
    createdAt?: Prisma.DateTimeFilter<"ProductVariant"> | Date | string;
    product?: Prisma.XOR<Prisma.ProductScalarRelationFilter, Prisma.ProductWhereInput>;
    movements?: Prisma.StockMovementListRelationFilter;
    promotionPrices?: Prisma.PromotionPriceListRelationFilter;
    priceChanges?: Prisma.PriceChangeListRelationFilter;
}, "id" | "sku">;
export type ProductVariantOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    productId?: Prisma.SortOrder;
    sku?: Prisma.SortOrder;
    price?: Prisma.SortOrder;
    quantity?: Prisma.SortOrder;
    reserved?: Prisma.SortOrder;
    inStock?: Prisma.SortOrder;
    attributes?: Prisma.SortOrder;
    photos?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    _count?: Prisma.ProductVariantCountOrderByAggregateInput;
    _avg?: Prisma.ProductVariantAvgOrderByAggregateInput;
    _max?: Prisma.ProductVariantMaxOrderByAggregateInput;
    _min?: Prisma.ProductVariantMinOrderByAggregateInput;
    _sum?: Prisma.ProductVariantSumOrderByAggregateInput;
};
export type ProductVariantScalarWhereWithAggregatesInput = {
    AND?: Prisma.ProductVariantScalarWhereWithAggregatesInput | Prisma.ProductVariantScalarWhereWithAggregatesInput[];
    OR?: Prisma.ProductVariantScalarWhereWithAggregatesInput[];
    NOT?: Prisma.ProductVariantScalarWhereWithAggregatesInput | Prisma.ProductVariantScalarWhereWithAggregatesInput[];
    id?: Prisma.IntWithAggregatesFilter<"ProductVariant"> | number;
    productId?: Prisma.IntWithAggregatesFilter<"ProductVariant"> | number;
    sku?: Prisma.StringWithAggregatesFilter<"ProductVariant"> | string;
    price?: Prisma.DecimalWithAggregatesFilter<"ProductVariant"> | runtime.Decimal | runtime.DecimalJsLike | number | string;
    quantity?: Prisma.IntWithAggregatesFilter<"ProductVariant"> | number;
    reserved?: Prisma.IntWithAggregatesFilter<"ProductVariant"> | number;
    inStock?: Prisma.BoolWithAggregatesFilter<"ProductVariant"> | boolean;
    attributes?: Prisma.JsonWithAggregatesFilter<"ProductVariant">;
    photos?: Prisma.StringNullableListFilter<"ProductVariant">;
    createdAt?: Prisma.DateTimeWithAggregatesFilter<"ProductVariant"> | Date | string;
};
export type ProductVariantCreateInput = {
    sku: string;
    price: runtime.Decimal | runtime.DecimalJsLike | number | string;
    quantity?: number;
    reserved?: number;
    inStock?: boolean;
    attributes: Prisma.JsonNullValueInput | runtime.InputJsonValue;
    photos?: Prisma.ProductVariantCreatephotosInput | string[];
    createdAt?: Date | string;
    product: Prisma.ProductCreateNestedOneWithoutVariantsInput;
    movements?: Prisma.StockMovementCreateNestedManyWithoutVariantInput;
    promotionPrices?: Prisma.PromotionPriceCreateNestedManyWithoutVariantInput;
    priceChanges?: Prisma.PriceChangeCreateNestedManyWithoutVariantInput;
};
export type ProductVariantUncheckedCreateInput = {
    id?: number;
    productId: number;
    sku: string;
    price: runtime.Decimal | runtime.DecimalJsLike | number | string;
    quantity?: number;
    reserved?: number;
    inStock?: boolean;
    attributes: Prisma.JsonNullValueInput | runtime.InputJsonValue;
    photos?: Prisma.ProductVariantCreatephotosInput | string[];
    createdAt?: Date | string;
    movements?: Prisma.StockMovementUncheckedCreateNestedManyWithoutVariantInput;
    promotionPrices?: Prisma.PromotionPriceUncheckedCreateNestedManyWithoutVariantInput;
    priceChanges?: Prisma.PriceChangeUncheckedCreateNestedManyWithoutVariantInput;
};
export type ProductVariantUpdateInput = {
    sku?: Prisma.StringFieldUpdateOperationsInput | string;
    price?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    quantity?: Prisma.IntFieldUpdateOperationsInput | number;
    reserved?: Prisma.IntFieldUpdateOperationsInput | number;
    inStock?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    attributes?: Prisma.JsonNullValueInput | runtime.InputJsonValue;
    photos?: Prisma.ProductVariantUpdatephotosInput | string[];
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    product?: Prisma.ProductUpdateOneRequiredWithoutVariantsNestedInput;
    movements?: Prisma.StockMovementUpdateManyWithoutVariantNestedInput;
    promotionPrices?: Prisma.PromotionPriceUpdateManyWithoutVariantNestedInput;
    priceChanges?: Prisma.PriceChangeUpdateManyWithoutVariantNestedInput;
};
export type ProductVariantUncheckedUpdateInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    productId?: Prisma.IntFieldUpdateOperationsInput | number;
    sku?: Prisma.StringFieldUpdateOperationsInput | string;
    price?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    quantity?: Prisma.IntFieldUpdateOperationsInput | number;
    reserved?: Prisma.IntFieldUpdateOperationsInput | number;
    inStock?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    attributes?: Prisma.JsonNullValueInput | runtime.InputJsonValue;
    photos?: Prisma.ProductVariantUpdatephotosInput | string[];
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    movements?: Prisma.StockMovementUncheckedUpdateManyWithoutVariantNestedInput;
    promotionPrices?: Prisma.PromotionPriceUncheckedUpdateManyWithoutVariantNestedInput;
    priceChanges?: Prisma.PriceChangeUncheckedUpdateManyWithoutVariantNestedInput;
};
export type ProductVariantCreateManyInput = {
    id?: number;
    productId: number;
    sku: string;
    price: runtime.Decimal | runtime.DecimalJsLike | number | string;
    quantity?: number;
    reserved?: number;
    inStock?: boolean;
    attributes: Prisma.JsonNullValueInput | runtime.InputJsonValue;
    photos?: Prisma.ProductVariantCreatephotosInput | string[];
    createdAt?: Date | string;
};
export type ProductVariantUpdateManyMutationInput = {
    sku?: Prisma.StringFieldUpdateOperationsInput | string;
    price?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    quantity?: Prisma.IntFieldUpdateOperationsInput | number;
    reserved?: Prisma.IntFieldUpdateOperationsInput | number;
    inStock?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    attributes?: Prisma.JsonNullValueInput | runtime.InputJsonValue;
    photos?: Prisma.ProductVariantUpdatephotosInput | string[];
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type ProductVariantUncheckedUpdateManyInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    productId?: Prisma.IntFieldUpdateOperationsInput | number;
    sku?: Prisma.StringFieldUpdateOperationsInput | string;
    price?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    quantity?: Prisma.IntFieldUpdateOperationsInput | number;
    reserved?: Prisma.IntFieldUpdateOperationsInput | number;
    inStock?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    attributes?: Prisma.JsonNullValueInput | runtime.InputJsonValue;
    photos?: Prisma.ProductVariantUpdatephotosInput | string[];
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type ProductVariantListRelationFilter = {
    every?: Prisma.ProductVariantWhereInput;
    some?: Prisma.ProductVariantWhereInput;
    none?: Prisma.ProductVariantWhereInput;
};
export type ProductVariantOrderByRelationAggregateInput = {
    _count?: Prisma.SortOrder;
};
export type ProductVariantCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    productId?: Prisma.SortOrder;
    sku?: Prisma.SortOrder;
    price?: Prisma.SortOrder;
    quantity?: Prisma.SortOrder;
    reserved?: Prisma.SortOrder;
    inStock?: Prisma.SortOrder;
    attributes?: Prisma.SortOrder;
    photos?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
};
export type ProductVariantAvgOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    productId?: Prisma.SortOrder;
    price?: Prisma.SortOrder;
    quantity?: Prisma.SortOrder;
    reserved?: Prisma.SortOrder;
};
export type ProductVariantMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    productId?: Prisma.SortOrder;
    sku?: Prisma.SortOrder;
    price?: Prisma.SortOrder;
    quantity?: Prisma.SortOrder;
    reserved?: Prisma.SortOrder;
    inStock?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
};
export type ProductVariantMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    productId?: Prisma.SortOrder;
    sku?: Prisma.SortOrder;
    price?: Prisma.SortOrder;
    quantity?: Prisma.SortOrder;
    reserved?: Prisma.SortOrder;
    inStock?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
};
export type ProductVariantSumOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    productId?: Prisma.SortOrder;
    price?: Prisma.SortOrder;
    quantity?: Prisma.SortOrder;
    reserved?: Prisma.SortOrder;
};
export type ProductVariantScalarRelationFilter = {
    is?: Prisma.ProductVariantWhereInput;
    isNot?: Prisma.ProductVariantWhereInput;
};
export type ProductVariantCreateNestedManyWithoutProductInput = {
    create?: Prisma.XOR<Prisma.ProductVariantCreateWithoutProductInput, Prisma.ProductVariantUncheckedCreateWithoutProductInput> | Prisma.ProductVariantCreateWithoutProductInput[] | Prisma.ProductVariantUncheckedCreateWithoutProductInput[];
    connectOrCreate?: Prisma.ProductVariantCreateOrConnectWithoutProductInput | Prisma.ProductVariantCreateOrConnectWithoutProductInput[];
    createMany?: Prisma.ProductVariantCreateManyProductInputEnvelope;
    connect?: Prisma.ProductVariantWhereUniqueInput | Prisma.ProductVariantWhereUniqueInput[];
};
export type ProductVariantUncheckedCreateNestedManyWithoutProductInput = {
    create?: Prisma.XOR<Prisma.ProductVariantCreateWithoutProductInput, Prisma.ProductVariantUncheckedCreateWithoutProductInput> | Prisma.ProductVariantCreateWithoutProductInput[] | Prisma.ProductVariantUncheckedCreateWithoutProductInput[];
    connectOrCreate?: Prisma.ProductVariantCreateOrConnectWithoutProductInput | Prisma.ProductVariantCreateOrConnectWithoutProductInput[];
    createMany?: Prisma.ProductVariantCreateManyProductInputEnvelope;
    connect?: Prisma.ProductVariantWhereUniqueInput | Prisma.ProductVariantWhereUniqueInput[];
};
export type ProductVariantUpdateManyWithoutProductNestedInput = {
    create?: Prisma.XOR<Prisma.ProductVariantCreateWithoutProductInput, Prisma.ProductVariantUncheckedCreateWithoutProductInput> | Prisma.ProductVariantCreateWithoutProductInput[] | Prisma.ProductVariantUncheckedCreateWithoutProductInput[];
    connectOrCreate?: Prisma.ProductVariantCreateOrConnectWithoutProductInput | Prisma.ProductVariantCreateOrConnectWithoutProductInput[];
    upsert?: Prisma.ProductVariantUpsertWithWhereUniqueWithoutProductInput | Prisma.ProductVariantUpsertWithWhereUniqueWithoutProductInput[];
    createMany?: Prisma.ProductVariantCreateManyProductInputEnvelope;
    set?: Prisma.ProductVariantWhereUniqueInput | Prisma.ProductVariantWhereUniqueInput[];
    disconnect?: Prisma.ProductVariantWhereUniqueInput | Prisma.ProductVariantWhereUniqueInput[];
    delete?: Prisma.ProductVariantWhereUniqueInput | Prisma.ProductVariantWhereUniqueInput[];
    connect?: Prisma.ProductVariantWhereUniqueInput | Prisma.ProductVariantWhereUniqueInput[];
    update?: Prisma.ProductVariantUpdateWithWhereUniqueWithoutProductInput | Prisma.ProductVariantUpdateWithWhereUniqueWithoutProductInput[];
    updateMany?: Prisma.ProductVariantUpdateManyWithWhereWithoutProductInput | Prisma.ProductVariantUpdateManyWithWhereWithoutProductInput[];
    deleteMany?: Prisma.ProductVariantScalarWhereInput | Prisma.ProductVariantScalarWhereInput[];
};
export type ProductVariantUncheckedUpdateManyWithoutProductNestedInput = {
    create?: Prisma.XOR<Prisma.ProductVariantCreateWithoutProductInput, Prisma.ProductVariantUncheckedCreateWithoutProductInput> | Prisma.ProductVariantCreateWithoutProductInput[] | Prisma.ProductVariantUncheckedCreateWithoutProductInput[];
    connectOrCreate?: Prisma.ProductVariantCreateOrConnectWithoutProductInput | Prisma.ProductVariantCreateOrConnectWithoutProductInput[];
    upsert?: Prisma.ProductVariantUpsertWithWhereUniqueWithoutProductInput | Prisma.ProductVariantUpsertWithWhereUniqueWithoutProductInput[];
    createMany?: Prisma.ProductVariantCreateManyProductInputEnvelope;
    set?: Prisma.ProductVariantWhereUniqueInput | Prisma.ProductVariantWhereUniqueInput[];
    disconnect?: Prisma.ProductVariantWhereUniqueInput | Prisma.ProductVariantWhereUniqueInput[];
    delete?: Prisma.ProductVariantWhereUniqueInput | Prisma.ProductVariantWhereUniqueInput[];
    connect?: Prisma.ProductVariantWhereUniqueInput | Prisma.ProductVariantWhereUniqueInput[];
    update?: Prisma.ProductVariantUpdateWithWhereUniqueWithoutProductInput | Prisma.ProductVariantUpdateWithWhereUniqueWithoutProductInput[];
    updateMany?: Prisma.ProductVariantUpdateManyWithWhereWithoutProductInput | Prisma.ProductVariantUpdateManyWithWhereWithoutProductInput[];
    deleteMany?: Prisma.ProductVariantScalarWhereInput | Prisma.ProductVariantScalarWhereInput[];
};
export type ProductVariantCreatephotosInput = {
    set: string[];
};
export type ProductVariantUpdatephotosInput = {
    set?: string[];
    push?: string | string[];
};
export type ProductVariantCreateNestedOneWithoutMovementsInput = {
    create?: Prisma.XOR<Prisma.ProductVariantCreateWithoutMovementsInput, Prisma.ProductVariantUncheckedCreateWithoutMovementsInput>;
    connectOrCreate?: Prisma.ProductVariantCreateOrConnectWithoutMovementsInput;
    connect?: Prisma.ProductVariantWhereUniqueInput;
};
export type ProductVariantUpdateOneRequiredWithoutMovementsNestedInput = {
    create?: Prisma.XOR<Prisma.ProductVariantCreateWithoutMovementsInput, Prisma.ProductVariantUncheckedCreateWithoutMovementsInput>;
    connectOrCreate?: Prisma.ProductVariantCreateOrConnectWithoutMovementsInput;
    upsert?: Prisma.ProductVariantUpsertWithoutMovementsInput;
    connect?: Prisma.ProductVariantWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.ProductVariantUpdateToOneWithWhereWithoutMovementsInput, Prisma.ProductVariantUpdateWithoutMovementsInput>, Prisma.ProductVariantUncheckedUpdateWithoutMovementsInput>;
};
export type ProductVariantCreateNestedOneWithoutPromotionPricesInput = {
    create?: Prisma.XOR<Prisma.ProductVariantCreateWithoutPromotionPricesInput, Prisma.ProductVariantUncheckedCreateWithoutPromotionPricesInput>;
    connectOrCreate?: Prisma.ProductVariantCreateOrConnectWithoutPromotionPricesInput;
    connect?: Prisma.ProductVariantWhereUniqueInput;
};
export type ProductVariantUpdateOneRequiredWithoutPromotionPricesNestedInput = {
    create?: Prisma.XOR<Prisma.ProductVariantCreateWithoutPromotionPricesInput, Prisma.ProductVariantUncheckedCreateWithoutPromotionPricesInput>;
    connectOrCreate?: Prisma.ProductVariantCreateOrConnectWithoutPromotionPricesInput;
    upsert?: Prisma.ProductVariantUpsertWithoutPromotionPricesInput;
    connect?: Prisma.ProductVariantWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.ProductVariantUpdateToOneWithWhereWithoutPromotionPricesInput, Prisma.ProductVariantUpdateWithoutPromotionPricesInput>, Prisma.ProductVariantUncheckedUpdateWithoutPromotionPricesInput>;
};
export type ProductVariantCreateNestedOneWithoutPriceChangesInput = {
    create?: Prisma.XOR<Prisma.ProductVariantCreateWithoutPriceChangesInput, Prisma.ProductVariantUncheckedCreateWithoutPriceChangesInput>;
    connectOrCreate?: Prisma.ProductVariantCreateOrConnectWithoutPriceChangesInput;
    connect?: Prisma.ProductVariantWhereUniqueInput;
};
export type ProductVariantUpdateOneRequiredWithoutPriceChangesNestedInput = {
    create?: Prisma.XOR<Prisma.ProductVariantCreateWithoutPriceChangesInput, Prisma.ProductVariantUncheckedCreateWithoutPriceChangesInput>;
    connectOrCreate?: Prisma.ProductVariantCreateOrConnectWithoutPriceChangesInput;
    upsert?: Prisma.ProductVariantUpsertWithoutPriceChangesInput;
    connect?: Prisma.ProductVariantWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.ProductVariantUpdateToOneWithWhereWithoutPriceChangesInput, Prisma.ProductVariantUpdateWithoutPriceChangesInput>, Prisma.ProductVariantUncheckedUpdateWithoutPriceChangesInput>;
};
export type ProductVariantCreateWithoutProductInput = {
    sku: string;
    price: runtime.Decimal | runtime.DecimalJsLike | number | string;
    quantity?: number;
    reserved?: number;
    inStock?: boolean;
    attributes: Prisma.JsonNullValueInput | runtime.InputJsonValue;
    photos?: Prisma.ProductVariantCreatephotosInput | string[];
    createdAt?: Date | string;
    movements?: Prisma.StockMovementCreateNestedManyWithoutVariantInput;
    promotionPrices?: Prisma.PromotionPriceCreateNestedManyWithoutVariantInput;
    priceChanges?: Prisma.PriceChangeCreateNestedManyWithoutVariantInput;
};
export type ProductVariantUncheckedCreateWithoutProductInput = {
    id?: number;
    sku: string;
    price: runtime.Decimal | runtime.DecimalJsLike | number | string;
    quantity?: number;
    reserved?: number;
    inStock?: boolean;
    attributes: Prisma.JsonNullValueInput | runtime.InputJsonValue;
    photos?: Prisma.ProductVariantCreatephotosInput | string[];
    createdAt?: Date | string;
    movements?: Prisma.StockMovementUncheckedCreateNestedManyWithoutVariantInput;
    promotionPrices?: Prisma.PromotionPriceUncheckedCreateNestedManyWithoutVariantInput;
    priceChanges?: Prisma.PriceChangeUncheckedCreateNestedManyWithoutVariantInput;
};
export type ProductVariantCreateOrConnectWithoutProductInput = {
    where: Prisma.ProductVariantWhereUniqueInput;
    create: Prisma.XOR<Prisma.ProductVariantCreateWithoutProductInput, Prisma.ProductVariantUncheckedCreateWithoutProductInput>;
};
export type ProductVariantCreateManyProductInputEnvelope = {
    data: Prisma.ProductVariantCreateManyProductInput | Prisma.ProductVariantCreateManyProductInput[];
    skipDuplicates?: boolean;
};
export type ProductVariantUpsertWithWhereUniqueWithoutProductInput = {
    where: Prisma.ProductVariantWhereUniqueInput;
    update: Prisma.XOR<Prisma.ProductVariantUpdateWithoutProductInput, Prisma.ProductVariantUncheckedUpdateWithoutProductInput>;
    create: Prisma.XOR<Prisma.ProductVariantCreateWithoutProductInput, Prisma.ProductVariantUncheckedCreateWithoutProductInput>;
};
export type ProductVariantUpdateWithWhereUniqueWithoutProductInput = {
    where: Prisma.ProductVariantWhereUniqueInput;
    data: Prisma.XOR<Prisma.ProductVariantUpdateWithoutProductInput, Prisma.ProductVariantUncheckedUpdateWithoutProductInput>;
};
export type ProductVariantUpdateManyWithWhereWithoutProductInput = {
    where: Prisma.ProductVariantScalarWhereInput;
    data: Prisma.XOR<Prisma.ProductVariantUpdateManyMutationInput, Prisma.ProductVariantUncheckedUpdateManyWithoutProductInput>;
};
export type ProductVariantScalarWhereInput = {
    AND?: Prisma.ProductVariantScalarWhereInput | Prisma.ProductVariantScalarWhereInput[];
    OR?: Prisma.ProductVariantScalarWhereInput[];
    NOT?: Prisma.ProductVariantScalarWhereInput | Prisma.ProductVariantScalarWhereInput[];
    id?: Prisma.IntFilter<"ProductVariant"> | number;
    productId?: Prisma.IntFilter<"ProductVariant"> | number;
    sku?: Prisma.StringFilter<"ProductVariant"> | string;
    price?: Prisma.DecimalFilter<"ProductVariant"> | runtime.Decimal | runtime.DecimalJsLike | number | string;
    quantity?: Prisma.IntFilter<"ProductVariant"> | number;
    reserved?: Prisma.IntFilter<"ProductVariant"> | number;
    inStock?: Prisma.BoolFilter<"ProductVariant"> | boolean;
    attributes?: Prisma.JsonFilter<"ProductVariant">;
    photos?: Prisma.StringNullableListFilter<"ProductVariant">;
    createdAt?: Prisma.DateTimeFilter<"ProductVariant"> | Date | string;
};
export type ProductVariantCreateWithoutMovementsInput = {
    sku: string;
    price: runtime.Decimal | runtime.DecimalJsLike | number | string;
    quantity?: number;
    reserved?: number;
    inStock?: boolean;
    attributes: Prisma.JsonNullValueInput | runtime.InputJsonValue;
    photos?: Prisma.ProductVariantCreatephotosInput | string[];
    createdAt?: Date | string;
    product: Prisma.ProductCreateNestedOneWithoutVariantsInput;
    promotionPrices?: Prisma.PromotionPriceCreateNestedManyWithoutVariantInput;
    priceChanges?: Prisma.PriceChangeCreateNestedManyWithoutVariantInput;
};
export type ProductVariantUncheckedCreateWithoutMovementsInput = {
    id?: number;
    productId: number;
    sku: string;
    price: runtime.Decimal | runtime.DecimalJsLike | number | string;
    quantity?: number;
    reserved?: number;
    inStock?: boolean;
    attributes: Prisma.JsonNullValueInput | runtime.InputJsonValue;
    photos?: Prisma.ProductVariantCreatephotosInput | string[];
    createdAt?: Date | string;
    promotionPrices?: Prisma.PromotionPriceUncheckedCreateNestedManyWithoutVariantInput;
    priceChanges?: Prisma.PriceChangeUncheckedCreateNestedManyWithoutVariantInput;
};
export type ProductVariantCreateOrConnectWithoutMovementsInput = {
    where: Prisma.ProductVariantWhereUniqueInput;
    create: Prisma.XOR<Prisma.ProductVariantCreateWithoutMovementsInput, Prisma.ProductVariantUncheckedCreateWithoutMovementsInput>;
};
export type ProductVariantUpsertWithoutMovementsInput = {
    update: Prisma.XOR<Prisma.ProductVariantUpdateWithoutMovementsInput, Prisma.ProductVariantUncheckedUpdateWithoutMovementsInput>;
    create: Prisma.XOR<Prisma.ProductVariantCreateWithoutMovementsInput, Prisma.ProductVariantUncheckedCreateWithoutMovementsInput>;
    where?: Prisma.ProductVariantWhereInput;
};
export type ProductVariantUpdateToOneWithWhereWithoutMovementsInput = {
    where?: Prisma.ProductVariantWhereInput;
    data: Prisma.XOR<Prisma.ProductVariantUpdateWithoutMovementsInput, Prisma.ProductVariantUncheckedUpdateWithoutMovementsInput>;
};
export type ProductVariantUpdateWithoutMovementsInput = {
    sku?: Prisma.StringFieldUpdateOperationsInput | string;
    price?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    quantity?: Prisma.IntFieldUpdateOperationsInput | number;
    reserved?: Prisma.IntFieldUpdateOperationsInput | number;
    inStock?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    attributes?: Prisma.JsonNullValueInput | runtime.InputJsonValue;
    photos?: Prisma.ProductVariantUpdatephotosInput | string[];
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    product?: Prisma.ProductUpdateOneRequiredWithoutVariantsNestedInput;
    promotionPrices?: Prisma.PromotionPriceUpdateManyWithoutVariantNestedInput;
    priceChanges?: Prisma.PriceChangeUpdateManyWithoutVariantNestedInput;
};
export type ProductVariantUncheckedUpdateWithoutMovementsInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    productId?: Prisma.IntFieldUpdateOperationsInput | number;
    sku?: Prisma.StringFieldUpdateOperationsInput | string;
    price?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    quantity?: Prisma.IntFieldUpdateOperationsInput | number;
    reserved?: Prisma.IntFieldUpdateOperationsInput | number;
    inStock?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    attributes?: Prisma.JsonNullValueInput | runtime.InputJsonValue;
    photos?: Prisma.ProductVariantUpdatephotosInput | string[];
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    promotionPrices?: Prisma.PromotionPriceUncheckedUpdateManyWithoutVariantNestedInput;
    priceChanges?: Prisma.PriceChangeUncheckedUpdateManyWithoutVariantNestedInput;
};
export type ProductVariantCreateWithoutPromotionPricesInput = {
    sku: string;
    price: runtime.Decimal | runtime.DecimalJsLike | number | string;
    quantity?: number;
    reserved?: number;
    inStock?: boolean;
    attributes: Prisma.JsonNullValueInput | runtime.InputJsonValue;
    photos?: Prisma.ProductVariantCreatephotosInput | string[];
    createdAt?: Date | string;
    product: Prisma.ProductCreateNestedOneWithoutVariantsInput;
    movements?: Prisma.StockMovementCreateNestedManyWithoutVariantInput;
    priceChanges?: Prisma.PriceChangeCreateNestedManyWithoutVariantInput;
};
export type ProductVariantUncheckedCreateWithoutPromotionPricesInput = {
    id?: number;
    productId: number;
    sku: string;
    price: runtime.Decimal | runtime.DecimalJsLike | number | string;
    quantity?: number;
    reserved?: number;
    inStock?: boolean;
    attributes: Prisma.JsonNullValueInput | runtime.InputJsonValue;
    photos?: Prisma.ProductVariantCreatephotosInput | string[];
    createdAt?: Date | string;
    movements?: Prisma.StockMovementUncheckedCreateNestedManyWithoutVariantInput;
    priceChanges?: Prisma.PriceChangeUncheckedCreateNestedManyWithoutVariantInput;
};
export type ProductVariantCreateOrConnectWithoutPromotionPricesInput = {
    where: Prisma.ProductVariantWhereUniqueInput;
    create: Prisma.XOR<Prisma.ProductVariantCreateWithoutPromotionPricesInput, Prisma.ProductVariantUncheckedCreateWithoutPromotionPricesInput>;
};
export type ProductVariantUpsertWithoutPromotionPricesInput = {
    update: Prisma.XOR<Prisma.ProductVariantUpdateWithoutPromotionPricesInput, Prisma.ProductVariantUncheckedUpdateWithoutPromotionPricesInput>;
    create: Prisma.XOR<Prisma.ProductVariantCreateWithoutPromotionPricesInput, Prisma.ProductVariantUncheckedCreateWithoutPromotionPricesInput>;
    where?: Prisma.ProductVariantWhereInput;
};
export type ProductVariantUpdateToOneWithWhereWithoutPromotionPricesInput = {
    where?: Prisma.ProductVariantWhereInput;
    data: Prisma.XOR<Prisma.ProductVariantUpdateWithoutPromotionPricesInput, Prisma.ProductVariantUncheckedUpdateWithoutPromotionPricesInput>;
};
export type ProductVariantUpdateWithoutPromotionPricesInput = {
    sku?: Prisma.StringFieldUpdateOperationsInput | string;
    price?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    quantity?: Prisma.IntFieldUpdateOperationsInput | number;
    reserved?: Prisma.IntFieldUpdateOperationsInput | number;
    inStock?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    attributes?: Prisma.JsonNullValueInput | runtime.InputJsonValue;
    photos?: Prisma.ProductVariantUpdatephotosInput | string[];
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    product?: Prisma.ProductUpdateOneRequiredWithoutVariantsNestedInput;
    movements?: Prisma.StockMovementUpdateManyWithoutVariantNestedInput;
    priceChanges?: Prisma.PriceChangeUpdateManyWithoutVariantNestedInput;
};
export type ProductVariantUncheckedUpdateWithoutPromotionPricesInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    productId?: Prisma.IntFieldUpdateOperationsInput | number;
    sku?: Prisma.StringFieldUpdateOperationsInput | string;
    price?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    quantity?: Prisma.IntFieldUpdateOperationsInput | number;
    reserved?: Prisma.IntFieldUpdateOperationsInput | number;
    inStock?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    attributes?: Prisma.JsonNullValueInput | runtime.InputJsonValue;
    photos?: Prisma.ProductVariantUpdatephotosInput | string[];
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    movements?: Prisma.StockMovementUncheckedUpdateManyWithoutVariantNestedInput;
    priceChanges?: Prisma.PriceChangeUncheckedUpdateManyWithoutVariantNestedInput;
};
export type ProductVariantCreateWithoutPriceChangesInput = {
    sku: string;
    price: runtime.Decimal | runtime.DecimalJsLike | number | string;
    quantity?: number;
    reserved?: number;
    inStock?: boolean;
    attributes: Prisma.JsonNullValueInput | runtime.InputJsonValue;
    photos?: Prisma.ProductVariantCreatephotosInput | string[];
    createdAt?: Date | string;
    product: Prisma.ProductCreateNestedOneWithoutVariantsInput;
    movements?: Prisma.StockMovementCreateNestedManyWithoutVariantInput;
    promotionPrices?: Prisma.PromotionPriceCreateNestedManyWithoutVariantInput;
};
export type ProductVariantUncheckedCreateWithoutPriceChangesInput = {
    id?: number;
    productId: number;
    sku: string;
    price: runtime.Decimal | runtime.DecimalJsLike | number | string;
    quantity?: number;
    reserved?: number;
    inStock?: boolean;
    attributes: Prisma.JsonNullValueInput | runtime.InputJsonValue;
    photos?: Prisma.ProductVariantCreatephotosInput | string[];
    createdAt?: Date | string;
    movements?: Prisma.StockMovementUncheckedCreateNestedManyWithoutVariantInput;
    promotionPrices?: Prisma.PromotionPriceUncheckedCreateNestedManyWithoutVariantInput;
};
export type ProductVariantCreateOrConnectWithoutPriceChangesInput = {
    where: Prisma.ProductVariantWhereUniqueInput;
    create: Prisma.XOR<Prisma.ProductVariantCreateWithoutPriceChangesInput, Prisma.ProductVariantUncheckedCreateWithoutPriceChangesInput>;
};
export type ProductVariantUpsertWithoutPriceChangesInput = {
    update: Prisma.XOR<Prisma.ProductVariantUpdateWithoutPriceChangesInput, Prisma.ProductVariantUncheckedUpdateWithoutPriceChangesInput>;
    create: Prisma.XOR<Prisma.ProductVariantCreateWithoutPriceChangesInput, Prisma.ProductVariantUncheckedCreateWithoutPriceChangesInput>;
    where?: Prisma.ProductVariantWhereInput;
};
export type ProductVariantUpdateToOneWithWhereWithoutPriceChangesInput = {
    where?: Prisma.ProductVariantWhereInput;
    data: Prisma.XOR<Prisma.ProductVariantUpdateWithoutPriceChangesInput, Prisma.ProductVariantUncheckedUpdateWithoutPriceChangesInput>;
};
export type ProductVariantUpdateWithoutPriceChangesInput = {
    sku?: Prisma.StringFieldUpdateOperationsInput | string;
    price?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    quantity?: Prisma.IntFieldUpdateOperationsInput | number;
    reserved?: Prisma.IntFieldUpdateOperationsInput | number;
    inStock?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    attributes?: Prisma.JsonNullValueInput | runtime.InputJsonValue;
    photos?: Prisma.ProductVariantUpdatephotosInput | string[];
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    product?: Prisma.ProductUpdateOneRequiredWithoutVariantsNestedInput;
    movements?: Prisma.StockMovementUpdateManyWithoutVariantNestedInput;
    promotionPrices?: Prisma.PromotionPriceUpdateManyWithoutVariantNestedInput;
};
export type ProductVariantUncheckedUpdateWithoutPriceChangesInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    productId?: Prisma.IntFieldUpdateOperationsInput | number;
    sku?: Prisma.StringFieldUpdateOperationsInput | string;
    price?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    quantity?: Prisma.IntFieldUpdateOperationsInput | number;
    reserved?: Prisma.IntFieldUpdateOperationsInput | number;
    inStock?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    attributes?: Prisma.JsonNullValueInput | runtime.InputJsonValue;
    photos?: Prisma.ProductVariantUpdatephotosInput | string[];
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    movements?: Prisma.StockMovementUncheckedUpdateManyWithoutVariantNestedInput;
    promotionPrices?: Prisma.PromotionPriceUncheckedUpdateManyWithoutVariantNestedInput;
};
export type ProductVariantCreateManyProductInput = {
    id?: number;
    sku: string;
    price: runtime.Decimal | runtime.DecimalJsLike | number | string;
    quantity?: number;
    reserved?: number;
    inStock?: boolean;
    attributes: Prisma.JsonNullValueInput | runtime.InputJsonValue;
    photos?: Prisma.ProductVariantCreatephotosInput | string[];
    createdAt?: Date | string;
};
export type ProductVariantUpdateWithoutProductInput = {
    sku?: Prisma.StringFieldUpdateOperationsInput | string;
    price?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    quantity?: Prisma.IntFieldUpdateOperationsInput | number;
    reserved?: Prisma.IntFieldUpdateOperationsInput | number;
    inStock?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    attributes?: Prisma.JsonNullValueInput | runtime.InputJsonValue;
    photos?: Prisma.ProductVariantUpdatephotosInput | string[];
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    movements?: Prisma.StockMovementUpdateManyWithoutVariantNestedInput;
    promotionPrices?: Prisma.PromotionPriceUpdateManyWithoutVariantNestedInput;
    priceChanges?: Prisma.PriceChangeUpdateManyWithoutVariantNestedInput;
};
export type ProductVariantUncheckedUpdateWithoutProductInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    sku?: Prisma.StringFieldUpdateOperationsInput | string;
    price?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    quantity?: Prisma.IntFieldUpdateOperationsInput | number;
    reserved?: Prisma.IntFieldUpdateOperationsInput | number;
    inStock?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    attributes?: Prisma.JsonNullValueInput | runtime.InputJsonValue;
    photos?: Prisma.ProductVariantUpdatephotosInput | string[];
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    movements?: Prisma.StockMovementUncheckedUpdateManyWithoutVariantNestedInput;
    promotionPrices?: Prisma.PromotionPriceUncheckedUpdateManyWithoutVariantNestedInput;
    priceChanges?: Prisma.PriceChangeUncheckedUpdateManyWithoutVariantNestedInput;
};
export type ProductVariantUncheckedUpdateManyWithoutProductInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    sku?: Prisma.StringFieldUpdateOperationsInput | string;
    price?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    quantity?: Prisma.IntFieldUpdateOperationsInput | number;
    reserved?: Prisma.IntFieldUpdateOperationsInput | number;
    inStock?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    attributes?: Prisma.JsonNullValueInput | runtime.InputJsonValue;
    photos?: Prisma.ProductVariantUpdatephotosInput | string[];
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
/**
 * Count Type ProductVariantCountOutputType
 */
export type ProductVariantCountOutputType = {
    movements: number;
    promotionPrices: number;
    priceChanges: number;
};
export type ProductVariantCountOutputTypeSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    movements?: boolean | ProductVariantCountOutputTypeCountMovementsArgs;
    promotionPrices?: boolean | ProductVariantCountOutputTypeCountPromotionPricesArgs;
    priceChanges?: boolean | ProductVariantCountOutputTypeCountPriceChangesArgs;
};
/**
 * ProductVariantCountOutputType without action
 */
export type ProductVariantCountOutputTypeDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProductVariantCountOutputType
     */
    select?: Prisma.ProductVariantCountOutputTypeSelect<ExtArgs> | null;
};
/**
 * ProductVariantCountOutputType without action
 */
export type ProductVariantCountOutputTypeCountMovementsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.StockMovementWhereInput;
};
/**
 * ProductVariantCountOutputType without action
 */
export type ProductVariantCountOutputTypeCountPromotionPricesArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.PromotionPriceWhereInput;
};
/**
 * ProductVariantCountOutputType without action
 */
export type ProductVariantCountOutputTypeCountPriceChangesArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.PriceChangeWhereInput;
};
export type ProductVariantSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    productId?: boolean;
    sku?: boolean;
    price?: boolean;
    quantity?: boolean;
    reserved?: boolean;
    inStock?: boolean;
    attributes?: boolean;
    photos?: boolean;
    createdAt?: boolean;
    product?: boolean | Prisma.ProductDefaultArgs<ExtArgs>;
    movements?: boolean | Prisma.ProductVariant$movementsArgs<ExtArgs>;
    promotionPrices?: boolean | Prisma.ProductVariant$promotionPricesArgs<ExtArgs>;
    priceChanges?: boolean | Prisma.ProductVariant$priceChangesArgs<ExtArgs>;
    _count?: boolean | Prisma.ProductVariantCountOutputTypeDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["productVariant"]>;
export type ProductVariantSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    productId?: boolean;
    sku?: boolean;
    price?: boolean;
    quantity?: boolean;
    reserved?: boolean;
    inStock?: boolean;
    attributes?: boolean;
    photos?: boolean;
    createdAt?: boolean;
    product?: boolean | Prisma.ProductDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["productVariant"]>;
export type ProductVariantSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    productId?: boolean;
    sku?: boolean;
    price?: boolean;
    quantity?: boolean;
    reserved?: boolean;
    inStock?: boolean;
    attributes?: boolean;
    photos?: boolean;
    createdAt?: boolean;
    product?: boolean | Prisma.ProductDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["productVariant"]>;
export type ProductVariantSelectScalar = {
    id?: boolean;
    productId?: boolean;
    sku?: boolean;
    price?: boolean;
    quantity?: boolean;
    reserved?: boolean;
    inStock?: boolean;
    attributes?: boolean;
    photos?: boolean;
    createdAt?: boolean;
};
export type ProductVariantOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "productId" | "sku" | "price" | "quantity" | "reserved" | "inStock" | "attributes" | "photos" | "createdAt", ExtArgs["result"]["productVariant"]>;
export type ProductVariantInclude<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    product?: boolean | Prisma.ProductDefaultArgs<ExtArgs>;
    movements?: boolean | Prisma.ProductVariant$movementsArgs<ExtArgs>;
    promotionPrices?: boolean | Prisma.ProductVariant$promotionPricesArgs<ExtArgs>;
    priceChanges?: boolean | Prisma.ProductVariant$priceChangesArgs<ExtArgs>;
    _count?: boolean | Prisma.ProductVariantCountOutputTypeDefaultArgs<ExtArgs>;
};
export type ProductVariantIncludeCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    product?: boolean | Prisma.ProductDefaultArgs<ExtArgs>;
};
export type ProductVariantIncludeUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    product?: boolean | Prisma.ProductDefaultArgs<ExtArgs>;
};
export type $ProductVariantPayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "ProductVariant";
    objects: {
        product: Prisma.$ProductPayload<ExtArgs>;
        movements: Prisma.$StockMovementPayload<ExtArgs>[];
        promotionPrices: Prisma.$PromotionPricePayload<ExtArgs>[];
        priceChanges: Prisma.$PriceChangePayload<ExtArgs>[];
    };
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: number;
        productId: number;
        sku: string;
        price: runtime.Decimal;
        quantity: number;
        reserved: number;
        inStock: boolean;
        attributes: runtime.JsonValue;
        photos: string[];
        createdAt: Date;
    }, ExtArgs["result"]["productVariant"]>;
    composites: {};
};
export type ProductVariantGetPayload<S extends boolean | null | undefined | ProductVariantDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$ProductVariantPayload, S>;
export type ProductVariantCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<ProductVariantFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: ProductVariantCountAggregateInputType | true;
};
export interface ProductVariantDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['ProductVariant'];
        meta: {
            name: 'ProductVariant';
        };
    };
    /**
     * Find zero or one ProductVariant that matches the filter.
     * @param {ProductVariantFindUniqueArgs} args - Arguments to find a ProductVariant
     * @example
     * // Get one ProductVariant
     * const productVariant = await prisma.productVariant.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ProductVariantFindUniqueArgs>(args: Prisma.SelectSubset<T, ProductVariantFindUniqueArgs<ExtArgs>>): Prisma.Prisma__ProductVariantClient<runtime.Types.Result.GetResult<Prisma.$ProductVariantPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find one ProductVariant that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {ProductVariantFindUniqueOrThrowArgs} args - Arguments to find a ProductVariant
     * @example
     * // Get one ProductVariant
     * const productVariant = await prisma.productVariant.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ProductVariantFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, ProductVariantFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__ProductVariantClient<runtime.Types.Result.GetResult<Prisma.$ProductVariantPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first ProductVariant that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProductVariantFindFirstArgs} args - Arguments to find a ProductVariant
     * @example
     * // Get one ProductVariant
     * const productVariant = await prisma.productVariant.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ProductVariantFindFirstArgs>(args?: Prisma.SelectSubset<T, ProductVariantFindFirstArgs<ExtArgs>>): Prisma.Prisma__ProductVariantClient<runtime.Types.Result.GetResult<Prisma.$ProductVariantPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first ProductVariant that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProductVariantFindFirstOrThrowArgs} args - Arguments to find a ProductVariant
     * @example
     * // Get one ProductVariant
     * const productVariant = await prisma.productVariant.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ProductVariantFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, ProductVariantFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__ProductVariantClient<runtime.Types.Result.GetResult<Prisma.$ProductVariantPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find zero or more ProductVariants that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProductVariantFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all ProductVariants
     * const productVariants = await prisma.productVariant.findMany()
     *
     * // Get first 10 ProductVariants
     * const productVariants = await prisma.productVariant.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const productVariantWithIdOnly = await prisma.productVariant.findMany({ select: { id: true } })
     *
     */
    findMany<T extends ProductVariantFindManyArgs>(args?: Prisma.SelectSubset<T, ProductVariantFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ProductVariantPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    /**
     * Create a ProductVariant.
     * @param {ProductVariantCreateArgs} args - Arguments to create a ProductVariant.
     * @example
     * // Create one ProductVariant
     * const ProductVariant = await prisma.productVariant.create({
     *   data: {
     *     // ... data to create a ProductVariant
     *   }
     * })
     *
     */
    create<T extends ProductVariantCreateArgs>(args: Prisma.SelectSubset<T, ProductVariantCreateArgs<ExtArgs>>): Prisma.Prisma__ProductVariantClient<runtime.Types.Result.GetResult<Prisma.$ProductVariantPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Create many ProductVariants.
     * @param {ProductVariantCreateManyArgs} args - Arguments to create many ProductVariants.
     * @example
     * // Create many ProductVariants
     * const productVariant = await prisma.productVariant.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends ProductVariantCreateManyArgs>(args?: Prisma.SelectSubset<T, ProductVariantCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Create many ProductVariants and returns the data saved in the database.
     * @param {ProductVariantCreateManyAndReturnArgs} args - Arguments to create many ProductVariants.
     * @example
     * // Create many ProductVariants
     * const productVariant = await prisma.productVariant.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many ProductVariants and only return the `id`
     * const productVariantWithIdOnly = await prisma.productVariant.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends ProductVariantCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, ProductVariantCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ProductVariantPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    /**
     * Delete a ProductVariant.
     * @param {ProductVariantDeleteArgs} args - Arguments to delete one ProductVariant.
     * @example
     * // Delete one ProductVariant
     * const ProductVariant = await prisma.productVariant.delete({
     *   where: {
     *     // ... filter to delete one ProductVariant
     *   }
     * })
     *
     */
    delete<T extends ProductVariantDeleteArgs>(args: Prisma.SelectSubset<T, ProductVariantDeleteArgs<ExtArgs>>): Prisma.Prisma__ProductVariantClient<runtime.Types.Result.GetResult<Prisma.$ProductVariantPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Update one ProductVariant.
     * @param {ProductVariantUpdateArgs} args - Arguments to update one ProductVariant.
     * @example
     * // Update one ProductVariant
     * const productVariant = await prisma.productVariant.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends ProductVariantUpdateArgs>(args: Prisma.SelectSubset<T, ProductVariantUpdateArgs<ExtArgs>>): Prisma.Prisma__ProductVariantClient<runtime.Types.Result.GetResult<Prisma.$ProductVariantPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Delete zero or more ProductVariants.
     * @param {ProductVariantDeleteManyArgs} args - Arguments to filter ProductVariants to delete.
     * @example
     * // Delete a few ProductVariants
     * const { count } = await prisma.productVariant.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends ProductVariantDeleteManyArgs>(args?: Prisma.SelectSubset<T, ProductVariantDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more ProductVariants.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProductVariantUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many ProductVariants
     * const productVariant = await prisma.productVariant.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends ProductVariantUpdateManyArgs>(args: Prisma.SelectSubset<T, ProductVariantUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more ProductVariants and returns the data updated in the database.
     * @param {ProductVariantUpdateManyAndReturnArgs} args - Arguments to update many ProductVariants.
     * @example
     * // Update many ProductVariants
     * const productVariant = await prisma.productVariant.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more ProductVariants and only return the `id`
     * const productVariantWithIdOnly = await prisma.productVariant.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    updateManyAndReturn<T extends ProductVariantUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, ProductVariantUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ProductVariantPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    /**
     * Create or update one ProductVariant.
     * @param {ProductVariantUpsertArgs} args - Arguments to update or create a ProductVariant.
     * @example
     * // Update or create a ProductVariant
     * const productVariant = await prisma.productVariant.upsert({
     *   create: {
     *     // ... data to create a ProductVariant
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the ProductVariant we want to update
     *   }
     * })
     */
    upsert<T extends ProductVariantUpsertArgs>(args: Prisma.SelectSubset<T, ProductVariantUpsertArgs<ExtArgs>>): Prisma.Prisma__ProductVariantClient<runtime.Types.Result.GetResult<Prisma.$ProductVariantPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Count the number of ProductVariants.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProductVariantCountArgs} args - Arguments to filter ProductVariants to count.
     * @example
     * // Count the number of ProductVariants
     * const count = await prisma.productVariant.count({
     *   where: {
     *     // ... the filter for the ProductVariants we want to count
     *   }
     * })
    **/
    count<T extends ProductVariantCountArgs>(args?: Prisma.Subset<T, ProductVariantCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], ProductVariantCountAggregateOutputType> : number>;
    /**
     * Allows you to perform aggregations operations on a ProductVariant.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProductVariantAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends ProductVariantAggregateArgs>(args: Prisma.Subset<T, ProductVariantAggregateArgs>): Prisma.PrismaPromise<GetProductVariantAggregateType<T>>;
    /**
     * Group by ProductVariant.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ProductVariantGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     *
    **/
    groupBy<T extends ProductVariantGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: ProductVariantGroupByArgs['orderBy'];
    } : {
        orderBy?: ProductVariantGroupByArgs['orderBy'];
    }, OrderFields extends Prisma.ExcludeUnderscoreKeys<Prisma.Keys<Prisma.MaybeTupleToUnion<T['orderBy']>>>, ByFields extends Prisma.MaybeTupleToUnion<T['by']>, ByValid extends Prisma.Has<ByFields, OrderFields>, HavingFields extends Prisma.GetHavingFields<T['having']>, HavingValid extends Prisma.Has<ByFields, HavingFields>, ByEmpty extends T['by'] extends never[] ? Prisma.True : Prisma.False, InputErrors extends ByEmpty extends Prisma.True ? `Error: "by" must not be empty.` : HavingValid extends Prisma.False ? {
        [P in HavingFields]: P extends ByFields ? never : P extends string ? `Error: Field "${P}" used in "having" needs to be provided in "by".` : [
            Error,
            'Field ',
            P,
            ` in "having" needs to be provided in "by"`
        ];
    }[HavingFields] : 'take' extends Prisma.Keys<T> ? 'orderBy' extends Prisma.Keys<T> ? ByValid extends Prisma.True ? {} : {
        [P in OrderFields]: P extends ByFields ? never : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
    }[OrderFields] : 'Error: If you provide "take", you also need to provide "orderBy"' : 'skip' extends Prisma.Keys<T> ? 'orderBy' extends Prisma.Keys<T> ? ByValid extends Prisma.True ? {} : {
        [P in OrderFields]: P extends ByFields ? never : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
    }[OrderFields] : 'Error: If you provide "skip", you also need to provide "orderBy"' : ByValid extends Prisma.True ? {} : {
        [P in OrderFields]: P extends ByFields ? never : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, ProductVariantGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetProductVariantGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the ProductVariant model
     */
    readonly fields: ProductVariantFieldRefs;
}
/**
 * The delegate class that acts as a "Promise-like" for ProductVariant.
 * Why is this prefixed with `Prisma__`?
 * Because we want to prevent naming conflicts as mentioned in
 * https://github.com/prisma/prisma-client-js/issues/707
 */
export interface Prisma__ProductVariantClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    product<T extends Prisma.ProductDefaultArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.ProductDefaultArgs<ExtArgs>>): Prisma.Prisma__ProductClient<runtime.Types.Result.GetResult<Prisma.$ProductPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>;
    movements<T extends Prisma.ProductVariant$movementsArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.ProductVariant$movementsArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$StockMovementPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    promotionPrices<T extends Prisma.ProductVariant$promotionPricesArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.ProductVariant$promotionPricesArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$PromotionPricePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    priceChanges<T extends Prisma.ProductVariant$priceChangesArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.ProductVariant$priceChangesArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$PriceChangePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): runtime.Types.Utils.JsPromise<TResult1 | TResult2>;
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): runtime.Types.Utils.JsPromise<T | TResult>;
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): runtime.Types.Utils.JsPromise<T>;
}
/**
 * Fields of the ProductVariant model
 */
export interface ProductVariantFieldRefs {
    readonly id: Prisma.FieldRef<"ProductVariant", 'Int'>;
    readonly productId: Prisma.FieldRef<"ProductVariant", 'Int'>;
    readonly sku: Prisma.FieldRef<"ProductVariant", 'String'>;
    readonly price: Prisma.FieldRef<"ProductVariant", 'Decimal'>;
    readonly quantity: Prisma.FieldRef<"ProductVariant", 'Int'>;
    readonly reserved: Prisma.FieldRef<"ProductVariant", 'Int'>;
    readonly inStock: Prisma.FieldRef<"ProductVariant", 'Boolean'>;
    readonly attributes: Prisma.FieldRef<"ProductVariant", 'Json'>;
    readonly photos: Prisma.FieldRef<"ProductVariant", 'String[]'>;
    readonly createdAt: Prisma.FieldRef<"ProductVariant", 'DateTime'>;
}
/**
 * ProductVariant findUnique
 */
export type ProductVariantFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProductVariant
     */
    select?: Prisma.ProductVariantSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ProductVariant
     */
    omit?: Prisma.ProductVariantOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ProductVariantInclude<ExtArgs> | null;
    /**
     * Filter, which ProductVariant to fetch.
     */
    where: Prisma.ProductVariantWhereUniqueInput;
};
/**
 * ProductVariant findUniqueOrThrow
 */
export type ProductVariantFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProductVariant
     */
    select?: Prisma.ProductVariantSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ProductVariant
     */
    omit?: Prisma.ProductVariantOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ProductVariantInclude<ExtArgs> | null;
    /**
     * Filter, which ProductVariant to fetch.
     */
    where: Prisma.ProductVariantWhereUniqueInput;
};
/**
 * ProductVariant findFirst
 */
export type ProductVariantFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProductVariant
     */
    select?: Prisma.ProductVariantSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ProductVariant
     */
    omit?: Prisma.ProductVariantOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ProductVariantInclude<ExtArgs> | null;
    /**
     * Filter, which ProductVariant to fetch.
     */
    where?: Prisma.ProductVariantWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of ProductVariants to fetch.
     */
    orderBy?: Prisma.ProductVariantOrderByWithRelationInput | Prisma.ProductVariantOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for ProductVariants.
     */
    cursor?: Prisma.ProductVariantWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` ProductVariants from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` ProductVariants.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of ProductVariants.
     */
    distinct?: Prisma.ProductVariantScalarFieldEnum | Prisma.ProductVariantScalarFieldEnum[];
};
/**
 * ProductVariant findFirstOrThrow
 */
export type ProductVariantFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProductVariant
     */
    select?: Prisma.ProductVariantSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ProductVariant
     */
    omit?: Prisma.ProductVariantOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ProductVariantInclude<ExtArgs> | null;
    /**
     * Filter, which ProductVariant to fetch.
     */
    where?: Prisma.ProductVariantWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of ProductVariants to fetch.
     */
    orderBy?: Prisma.ProductVariantOrderByWithRelationInput | Prisma.ProductVariantOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for ProductVariants.
     */
    cursor?: Prisma.ProductVariantWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` ProductVariants from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` ProductVariants.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of ProductVariants.
     */
    distinct?: Prisma.ProductVariantScalarFieldEnum | Prisma.ProductVariantScalarFieldEnum[];
};
/**
 * ProductVariant findMany
 */
export type ProductVariantFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProductVariant
     */
    select?: Prisma.ProductVariantSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ProductVariant
     */
    omit?: Prisma.ProductVariantOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ProductVariantInclude<ExtArgs> | null;
    /**
     * Filter, which ProductVariants to fetch.
     */
    where?: Prisma.ProductVariantWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of ProductVariants to fetch.
     */
    orderBy?: Prisma.ProductVariantOrderByWithRelationInput | Prisma.ProductVariantOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing ProductVariants.
     */
    cursor?: Prisma.ProductVariantWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` ProductVariants from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` ProductVariants.
     */
    skip?: number;
    distinct?: Prisma.ProductVariantScalarFieldEnum | Prisma.ProductVariantScalarFieldEnum[];
};
/**
 * ProductVariant create
 */
export type ProductVariantCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProductVariant
     */
    select?: Prisma.ProductVariantSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ProductVariant
     */
    omit?: Prisma.ProductVariantOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ProductVariantInclude<ExtArgs> | null;
    /**
     * The data needed to create a ProductVariant.
     */
    data: Prisma.XOR<Prisma.ProductVariantCreateInput, Prisma.ProductVariantUncheckedCreateInput>;
};
/**
 * ProductVariant createMany
 */
export type ProductVariantCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to create many ProductVariants.
     */
    data: Prisma.ProductVariantCreateManyInput | Prisma.ProductVariantCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * ProductVariant createManyAndReturn
 */
export type ProductVariantCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProductVariant
     */
    select?: Prisma.ProductVariantSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the ProductVariant
     */
    omit?: Prisma.ProductVariantOmit<ExtArgs> | null;
    /**
     * The data used to create many ProductVariants.
     */
    data: Prisma.ProductVariantCreateManyInput | Prisma.ProductVariantCreateManyInput[];
    skipDuplicates?: boolean;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ProductVariantIncludeCreateManyAndReturn<ExtArgs> | null;
};
/**
 * ProductVariant update
 */
export type ProductVariantUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProductVariant
     */
    select?: Prisma.ProductVariantSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ProductVariant
     */
    omit?: Prisma.ProductVariantOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ProductVariantInclude<ExtArgs> | null;
    /**
     * The data needed to update a ProductVariant.
     */
    data: Prisma.XOR<Prisma.ProductVariantUpdateInput, Prisma.ProductVariantUncheckedUpdateInput>;
    /**
     * Choose, which ProductVariant to update.
     */
    where: Prisma.ProductVariantWhereUniqueInput;
};
/**
 * ProductVariant updateMany
 */
export type ProductVariantUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to update ProductVariants.
     */
    data: Prisma.XOR<Prisma.ProductVariantUpdateManyMutationInput, Prisma.ProductVariantUncheckedUpdateManyInput>;
    /**
     * Filter which ProductVariants to update
     */
    where?: Prisma.ProductVariantWhereInput;
    /**
     * Limit how many ProductVariants to update.
     */
    limit?: number;
};
/**
 * ProductVariant updateManyAndReturn
 */
export type ProductVariantUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProductVariant
     */
    select?: Prisma.ProductVariantSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the ProductVariant
     */
    omit?: Prisma.ProductVariantOmit<ExtArgs> | null;
    /**
     * The data used to update ProductVariants.
     */
    data: Prisma.XOR<Prisma.ProductVariantUpdateManyMutationInput, Prisma.ProductVariantUncheckedUpdateManyInput>;
    /**
     * Filter which ProductVariants to update
     */
    where?: Prisma.ProductVariantWhereInput;
    /**
     * Limit how many ProductVariants to update.
     */
    limit?: number;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ProductVariantIncludeUpdateManyAndReturn<ExtArgs> | null;
};
/**
 * ProductVariant upsert
 */
export type ProductVariantUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProductVariant
     */
    select?: Prisma.ProductVariantSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ProductVariant
     */
    omit?: Prisma.ProductVariantOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ProductVariantInclude<ExtArgs> | null;
    /**
     * The filter to search for the ProductVariant to update in case it exists.
     */
    where: Prisma.ProductVariantWhereUniqueInput;
    /**
     * In case the ProductVariant found by the `where` argument doesn't exist, create a new ProductVariant with this data.
     */
    create: Prisma.XOR<Prisma.ProductVariantCreateInput, Prisma.ProductVariantUncheckedCreateInput>;
    /**
     * In case the ProductVariant was found with the provided `where` argument, update it with this data.
     */
    update: Prisma.XOR<Prisma.ProductVariantUpdateInput, Prisma.ProductVariantUncheckedUpdateInput>;
};
/**
 * ProductVariant delete
 */
export type ProductVariantDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProductVariant
     */
    select?: Prisma.ProductVariantSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ProductVariant
     */
    omit?: Prisma.ProductVariantOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ProductVariantInclude<ExtArgs> | null;
    /**
     * Filter which ProductVariant to delete.
     */
    where: Prisma.ProductVariantWhereUniqueInput;
};
/**
 * ProductVariant deleteMany
 */
export type ProductVariantDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which ProductVariants to delete
     */
    where?: Prisma.ProductVariantWhereInput;
    /**
     * Limit how many ProductVariants to delete.
     */
    limit?: number;
};
/**
 * ProductVariant.movements
 */
export type ProductVariant$movementsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the StockMovement
     */
    select?: Prisma.StockMovementSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the StockMovement
     */
    omit?: Prisma.StockMovementOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.StockMovementInclude<ExtArgs> | null;
    where?: Prisma.StockMovementWhereInput;
    orderBy?: Prisma.StockMovementOrderByWithRelationInput | Prisma.StockMovementOrderByWithRelationInput[];
    cursor?: Prisma.StockMovementWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.StockMovementScalarFieldEnum | Prisma.StockMovementScalarFieldEnum[];
};
/**
 * ProductVariant.promotionPrices
 */
export type ProductVariant$promotionPricesArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PromotionPrice
     */
    select?: Prisma.PromotionPriceSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the PromotionPrice
     */
    omit?: Prisma.PromotionPriceOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.PromotionPriceInclude<ExtArgs> | null;
    where?: Prisma.PromotionPriceWhereInput;
    orderBy?: Prisma.PromotionPriceOrderByWithRelationInput | Prisma.PromotionPriceOrderByWithRelationInput[];
    cursor?: Prisma.PromotionPriceWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.PromotionPriceScalarFieldEnum | Prisma.PromotionPriceScalarFieldEnum[];
};
/**
 * ProductVariant.priceChanges
 */
export type ProductVariant$priceChangesArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PriceChange
     */
    select?: Prisma.PriceChangeSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the PriceChange
     */
    omit?: Prisma.PriceChangeOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.PriceChangeInclude<ExtArgs> | null;
    where?: Prisma.PriceChangeWhereInput;
    orderBy?: Prisma.PriceChangeOrderByWithRelationInput | Prisma.PriceChangeOrderByWithRelationInput[];
    cursor?: Prisma.PriceChangeWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.PriceChangeScalarFieldEnum | Prisma.PriceChangeScalarFieldEnum[];
};
/**
 * ProductVariant without action
 */
export type ProductVariantDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ProductVariant
     */
    select?: Prisma.ProductVariantSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the ProductVariant
     */
    omit?: Prisma.ProductVariantOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ProductVariantInclude<ExtArgs> | null;
};
export {};
//# sourceMappingURL=ProductVariant.d.ts.map