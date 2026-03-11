import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace";
/**
 * Model PromotionPrice
 *
 */
export type PromotionPriceModel = runtime.Types.Result.DefaultSelection<Prisma.$PromotionPricePayload>;
export type AggregatePromotionPrice = {
    _count: PromotionPriceCountAggregateOutputType | null;
    _avg: PromotionPriceAvgAggregateOutputType | null;
    _sum: PromotionPriceSumAggregateOutputType | null;
    _min: PromotionPriceMinAggregateOutputType | null;
    _max: PromotionPriceMaxAggregateOutputType | null;
};
export type PromotionPriceAvgAggregateOutputType = {
    id: number | null;
    promotionId: number | null;
    variantId: number | null;
    originalPrice: runtime.Decimal | null;
};
export type PromotionPriceSumAggregateOutputType = {
    id: number | null;
    promotionId: number | null;
    variantId: number | null;
    originalPrice: runtime.Decimal | null;
};
export type PromotionPriceMinAggregateOutputType = {
    id: number | null;
    promotionId: number | null;
    variantId: number | null;
    originalPrice: runtime.Decimal | null;
};
export type PromotionPriceMaxAggregateOutputType = {
    id: number | null;
    promotionId: number | null;
    variantId: number | null;
    originalPrice: runtime.Decimal | null;
};
export type PromotionPriceCountAggregateOutputType = {
    id: number;
    promotionId: number;
    variantId: number;
    originalPrice: number;
    _all: number;
};
export type PromotionPriceAvgAggregateInputType = {
    id?: true;
    promotionId?: true;
    variantId?: true;
    originalPrice?: true;
};
export type PromotionPriceSumAggregateInputType = {
    id?: true;
    promotionId?: true;
    variantId?: true;
    originalPrice?: true;
};
export type PromotionPriceMinAggregateInputType = {
    id?: true;
    promotionId?: true;
    variantId?: true;
    originalPrice?: true;
};
export type PromotionPriceMaxAggregateInputType = {
    id?: true;
    promotionId?: true;
    variantId?: true;
    originalPrice?: true;
};
export type PromotionPriceCountAggregateInputType = {
    id?: true;
    promotionId?: true;
    variantId?: true;
    originalPrice?: true;
    _all?: true;
};
export type PromotionPriceAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which PromotionPrice to aggregate.
     */
    where?: Prisma.PromotionPriceWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of PromotionPrices to fetch.
     */
    orderBy?: Prisma.PromotionPriceOrderByWithRelationInput | Prisma.PromotionPriceOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: Prisma.PromotionPriceWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` PromotionPrices from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` PromotionPrices.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned PromotionPrices
    **/
    _count?: true | PromotionPriceCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to average
    **/
    _avg?: PromotionPriceAvgAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to sum
    **/
    _sum?: PromotionPriceSumAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
    **/
    _min?: PromotionPriceMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
    **/
    _max?: PromotionPriceMaxAggregateInputType;
};
export type GetPromotionPriceAggregateType<T extends PromotionPriceAggregateArgs> = {
    [P in keyof T & keyof AggregatePromotionPrice]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregatePromotionPrice[P]> : Prisma.GetScalarType<T[P], AggregatePromotionPrice[P]>;
};
export type PromotionPriceGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.PromotionPriceWhereInput;
    orderBy?: Prisma.PromotionPriceOrderByWithAggregationInput | Prisma.PromotionPriceOrderByWithAggregationInput[];
    by: Prisma.PromotionPriceScalarFieldEnum[] | Prisma.PromotionPriceScalarFieldEnum;
    having?: Prisma.PromotionPriceScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: PromotionPriceCountAggregateInputType | true;
    _avg?: PromotionPriceAvgAggregateInputType;
    _sum?: PromotionPriceSumAggregateInputType;
    _min?: PromotionPriceMinAggregateInputType;
    _max?: PromotionPriceMaxAggregateInputType;
};
export type PromotionPriceGroupByOutputType = {
    id: number;
    promotionId: number;
    variantId: number;
    originalPrice: runtime.Decimal;
    _count: PromotionPriceCountAggregateOutputType | null;
    _avg: PromotionPriceAvgAggregateOutputType | null;
    _sum: PromotionPriceSumAggregateOutputType | null;
    _min: PromotionPriceMinAggregateOutputType | null;
    _max: PromotionPriceMaxAggregateOutputType | null;
};
type GetPromotionPriceGroupByPayload<T extends PromotionPriceGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<PromotionPriceGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof PromotionPriceGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], PromotionPriceGroupByOutputType[P]> : Prisma.GetScalarType<T[P], PromotionPriceGroupByOutputType[P]>;
}>>;
export type PromotionPriceWhereInput = {
    AND?: Prisma.PromotionPriceWhereInput | Prisma.PromotionPriceWhereInput[];
    OR?: Prisma.PromotionPriceWhereInput[];
    NOT?: Prisma.PromotionPriceWhereInput | Prisma.PromotionPriceWhereInput[];
    id?: Prisma.IntFilter<"PromotionPrice"> | number;
    promotionId?: Prisma.IntFilter<"PromotionPrice"> | number;
    variantId?: Prisma.IntFilter<"PromotionPrice"> | number;
    originalPrice?: Prisma.DecimalFilter<"PromotionPrice"> | runtime.Decimal | runtime.DecimalJsLike | number | string;
    promotion?: Prisma.XOR<Prisma.PromotionScalarRelationFilter, Prisma.PromotionWhereInput>;
    variant?: Prisma.XOR<Prisma.ProductVariantScalarRelationFilter, Prisma.ProductVariantWhereInput>;
};
export type PromotionPriceOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    promotionId?: Prisma.SortOrder;
    variantId?: Prisma.SortOrder;
    originalPrice?: Prisma.SortOrder;
    promotion?: Prisma.PromotionOrderByWithRelationInput;
    variant?: Prisma.ProductVariantOrderByWithRelationInput;
};
export type PromotionPriceWhereUniqueInput = Prisma.AtLeast<{
    id?: number;
    promotionId_variantId?: Prisma.PromotionPricePromotionIdVariantIdCompoundUniqueInput;
    AND?: Prisma.PromotionPriceWhereInput | Prisma.PromotionPriceWhereInput[];
    OR?: Prisma.PromotionPriceWhereInput[];
    NOT?: Prisma.PromotionPriceWhereInput | Prisma.PromotionPriceWhereInput[];
    promotionId?: Prisma.IntFilter<"PromotionPrice"> | number;
    variantId?: Prisma.IntFilter<"PromotionPrice"> | number;
    originalPrice?: Prisma.DecimalFilter<"PromotionPrice"> | runtime.Decimal | runtime.DecimalJsLike | number | string;
    promotion?: Prisma.XOR<Prisma.PromotionScalarRelationFilter, Prisma.PromotionWhereInput>;
    variant?: Prisma.XOR<Prisma.ProductVariantScalarRelationFilter, Prisma.ProductVariantWhereInput>;
}, "id" | "promotionId_variantId">;
export type PromotionPriceOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    promotionId?: Prisma.SortOrder;
    variantId?: Prisma.SortOrder;
    originalPrice?: Prisma.SortOrder;
    _count?: Prisma.PromotionPriceCountOrderByAggregateInput;
    _avg?: Prisma.PromotionPriceAvgOrderByAggregateInput;
    _max?: Prisma.PromotionPriceMaxOrderByAggregateInput;
    _min?: Prisma.PromotionPriceMinOrderByAggregateInput;
    _sum?: Prisma.PromotionPriceSumOrderByAggregateInput;
};
export type PromotionPriceScalarWhereWithAggregatesInput = {
    AND?: Prisma.PromotionPriceScalarWhereWithAggregatesInput | Prisma.PromotionPriceScalarWhereWithAggregatesInput[];
    OR?: Prisma.PromotionPriceScalarWhereWithAggregatesInput[];
    NOT?: Prisma.PromotionPriceScalarWhereWithAggregatesInput | Prisma.PromotionPriceScalarWhereWithAggregatesInput[];
    id?: Prisma.IntWithAggregatesFilter<"PromotionPrice"> | number;
    promotionId?: Prisma.IntWithAggregatesFilter<"PromotionPrice"> | number;
    variantId?: Prisma.IntWithAggregatesFilter<"PromotionPrice"> | number;
    originalPrice?: Prisma.DecimalWithAggregatesFilter<"PromotionPrice"> | runtime.Decimal | runtime.DecimalJsLike | number | string;
};
export type PromotionPriceCreateInput = {
    originalPrice: runtime.Decimal | runtime.DecimalJsLike | number | string;
    promotion: Prisma.PromotionCreateNestedOneWithoutPricesInput;
    variant: Prisma.ProductVariantCreateNestedOneWithoutPromotionPricesInput;
};
export type PromotionPriceUncheckedCreateInput = {
    id?: number;
    promotionId: number;
    variantId: number;
    originalPrice: runtime.Decimal | runtime.DecimalJsLike | number | string;
};
export type PromotionPriceUpdateInput = {
    originalPrice?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    promotion?: Prisma.PromotionUpdateOneRequiredWithoutPricesNestedInput;
    variant?: Prisma.ProductVariantUpdateOneRequiredWithoutPromotionPricesNestedInput;
};
export type PromotionPriceUncheckedUpdateInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    promotionId?: Prisma.IntFieldUpdateOperationsInput | number;
    variantId?: Prisma.IntFieldUpdateOperationsInput | number;
    originalPrice?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
};
export type PromotionPriceCreateManyInput = {
    id?: number;
    promotionId: number;
    variantId: number;
    originalPrice: runtime.Decimal | runtime.DecimalJsLike | number | string;
};
export type PromotionPriceUpdateManyMutationInput = {
    originalPrice?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
};
export type PromotionPriceUncheckedUpdateManyInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    promotionId?: Prisma.IntFieldUpdateOperationsInput | number;
    variantId?: Prisma.IntFieldUpdateOperationsInput | number;
    originalPrice?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
};
export type PromotionPriceListRelationFilter = {
    every?: Prisma.PromotionPriceWhereInput;
    some?: Prisma.PromotionPriceWhereInput;
    none?: Prisma.PromotionPriceWhereInput;
};
export type PromotionPriceOrderByRelationAggregateInput = {
    _count?: Prisma.SortOrder;
};
export type PromotionPricePromotionIdVariantIdCompoundUniqueInput = {
    promotionId: number;
    variantId: number;
};
export type PromotionPriceCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    promotionId?: Prisma.SortOrder;
    variantId?: Prisma.SortOrder;
    originalPrice?: Prisma.SortOrder;
};
export type PromotionPriceAvgOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    promotionId?: Prisma.SortOrder;
    variantId?: Prisma.SortOrder;
    originalPrice?: Prisma.SortOrder;
};
export type PromotionPriceMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    promotionId?: Prisma.SortOrder;
    variantId?: Prisma.SortOrder;
    originalPrice?: Prisma.SortOrder;
};
export type PromotionPriceMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    promotionId?: Prisma.SortOrder;
    variantId?: Prisma.SortOrder;
    originalPrice?: Prisma.SortOrder;
};
export type PromotionPriceSumOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    promotionId?: Prisma.SortOrder;
    variantId?: Prisma.SortOrder;
    originalPrice?: Prisma.SortOrder;
};
export type PromotionPriceCreateNestedManyWithoutVariantInput = {
    create?: Prisma.XOR<Prisma.PromotionPriceCreateWithoutVariantInput, Prisma.PromotionPriceUncheckedCreateWithoutVariantInput> | Prisma.PromotionPriceCreateWithoutVariantInput[] | Prisma.PromotionPriceUncheckedCreateWithoutVariantInput[];
    connectOrCreate?: Prisma.PromotionPriceCreateOrConnectWithoutVariantInput | Prisma.PromotionPriceCreateOrConnectWithoutVariantInput[];
    createMany?: Prisma.PromotionPriceCreateManyVariantInputEnvelope;
    connect?: Prisma.PromotionPriceWhereUniqueInput | Prisma.PromotionPriceWhereUniqueInput[];
};
export type PromotionPriceUncheckedCreateNestedManyWithoutVariantInput = {
    create?: Prisma.XOR<Prisma.PromotionPriceCreateWithoutVariantInput, Prisma.PromotionPriceUncheckedCreateWithoutVariantInput> | Prisma.PromotionPriceCreateWithoutVariantInput[] | Prisma.PromotionPriceUncheckedCreateWithoutVariantInput[];
    connectOrCreate?: Prisma.PromotionPriceCreateOrConnectWithoutVariantInput | Prisma.PromotionPriceCreateOrConnectWithoutVariantInput[];
    createMany?: Prisma.PromotionPriceCreateManyVariantInputEnvelope;
    connect?: Prisma.PromotionPriceWhereUniqueInput | Prisma.PromotionPriceWhereUniqueInput[];
};
export type PromotionPriceUpdateManyWithoutVariantNestedInput = {
    create?: Prisma.XOR<Prisma.PromotionPriceCreateWithoutVariantInput, Prisma.PromotionPriceUncheckedCreateWithoutVariantInput> | Prisma.PromotionPriceCreateWithoutVariantInput[] | Prisma.PromotionPriceUncheckedCreateWithoutVariantInput[];
    connectOrCreate?: Prisma.PromotionPriceCreateOrConnectWithoutVariantInput | Prisma.PromotionPriceCreateOrConnectWithoutVariantInput[];
    upsert?: Prisma.PromotionPriceUpsertWithWhereUniqueWithoutVariantInput | Prisma.PromotionPriceUpsertWithWhereUniqueWithoutVariantInput[];
    createMany?: Prisma.PromotionPriceCreateManyVariantInputEnvelope;
    set?: Prisma.PromotionPriceWhereUniqueInput | Prisma.PromotionPriceWhereUniqueInput[];
    disconnect?: Prisma.PromotionPriceWhereUniqueInput | Prisma.PromotionPriceWhereUniqueInput[];
    delete?: Prisma.PromotionPriceWhereUniqueInput | Prisma.PromotionPriceWhereUniqueInput[];
    connect?: Prisma.PromotionPriceWhereUniqueInput | Prisma.PromotionPriceWhereUniqueInput[];
    update?: Prisma.PromotionPriceUpdateWithWhereUniqueWithoutVariantInput | Prisma.PromotionPriceUpdateWithWhereUniqueWithoutVariantInput[];
    updateMany?: Prisma.PromotionPriceUpdateManyWithWhereWithoutVariantInput | Prisma.PromotionPriceUpdateManyWithWhereWithoutVariantInput[];
    deleteMany?: Prisma.PromotionPriceScalarWhereInput | Prisma.PromotionPriceScalarWhereInput[];
};
export type PromotionPriceUncheckedUpdateManyWithoutVariantNestedInput = {
    create?: Prisma.XOR<Prisma.PromotionPriceCreateWithoutVariantInput, Prisma.PromotionPriceUncheckedCreateWithoutVariantInput> | Prisma.PromotionPriceCreateWithoutVariantInput[] | Prisma.PromotionPriceUncheckedCreateWithoutVariantInput[];
    connectOrCreate?: Prisma.PromotionPriceCreateOrConnectWithoutVariantInput | Prisma.PromotionPriceCreateOrConnectWithoutVariantInput[];
    upsert?: Prisma.PromotionPriceUpsertWithWhereUniqueWithoutVariantInput | Prisma.PromotionPriceUpsertWithWhereUniqueWithoutVariantInput[];
    createMany?: Prisma.PromotionPriceCreateManyVariantInputEnvelope;
    set?: Prisma.PromotionPriceWhereUniqueInput | Prisma.PromotionPriceWhereUniqueInput[];
    disconnect?: Prisma.PromotionPriceWhereUniqueInput | Prisma.PromotionPriceWhereUniqueInput[];
    delete?: Prisma.PromotionPriceWhereUniqueInput | Prisma.PromotionPriceWhereUniqueInput[];
    connect?: Prisma.PromotionPriceWhereUniqueInput | Prisma.PromotionPriceWhereUniqueInput[];
    update?: Prisma.PromotionPriceUpdateWithWhereUniqueWithoutVariantInput | Prisma.PromotionPriceUpdateWithWhereUniqueWithoutVariantInput[];
    updateMany?: Prisma.PromotionPriceUpdateManyWithWhereWithoutVariantInput | Prisma.PromotionPriceUpdateManyWithWhereWithoutVariantInput[];
    deleteMany?: Prisma.PromotionPriceScalarWhereInput | Prisma.PromotionPriceScalarWhereInput[];
};
export type PromotionPriceCreateNestedManyWithoutPromotionInput = {
    create?: Prisma.XOR<Prisma.PromotionPriceCreateWithoutPromotionInput, Prisma.PromotionPriceUncheckedCreateWithoutPromotionInput> | Prisma.PromotionPriceCreateWithoutPromotionInput[] | Prisma.PromotionPriceUncheckedCreateWithoutPromotionInput[];
    connectOrCreate?: Prisma.PromotionPriceCreateOrConnectWithoutPromotionInput | Prisma.PromotionPriceCreateOrConnectWithoutPromotionInput[];
    createMany?: Prisma.PromotionPriceCreateManyPromotionInputEnvelope;
    connect?: Prisma.PromotionPriceWhereUniqueInput | Prisma.PromotionPriceWhereUniqueInput[];
};
export type PromotionPriceUncheckedCreateNestedManyWithoutPromotionInput = {
    create?: Prisma.XOR<Prisma.PromotionPriceCreateWithoutPromotionInput, Prisma.PromotionPriceUncheckedCreateWithoutPromotionInput> | Prisma.PromotionPriceCreateWithoutPromotionInput[] | Prisma.PromotionPriceUncheckedCreateWithoutPromotionInput[];
    connectOrCreate?: Prisma.PromotionPriceCreateOrConnectWithoutPromotionInput | Prisma.PromotionPriceCreateOrConnectWithoutPromotionInput[];
    createMany?: Prisma.PromotionPriceCreateManyPromotionInputEnvelope;
    connect?: Prisma.PromotionPriceWhereUniqueInput | Prisma.PromotionPriceWhereUniqueInput[];
};
export type PromotionPriceUpdateManyWithoutPromotionNestedInput = {
    create?: Prisma.XOR<Prisma.PromotionPriceCreateWithoutPromotionInput, Prisma.PromotionPriceUncheckedCreateWithoutPromotionInput> | Prisma.PromotionPriceCreateWithoutPromotionInput[] | Prisma.PromotionPriceUncheckedCreateWithoutPromotionInput[];
    connectOrCreate?: Prisma.PromotionPriceCreateOrConnectWithoutPromotionInput | Prisma.PromotionPriceCreateOrConnectWithoutPromotionInput[];
    upsert?: Prisma.PromotionPriceUpsertWithWhereUniqueWithoutPromotionInput | Prisma.PromotionPriceUpsertWithWhereUniqueWithoutPromotionInput[];
    createMany?: Prisma.PromotionPriceCreateManyPromotionInputEnvelope;
    set?: Prisma.PromotionPriceWhereUniqueInput | Prisma.PromotionPriceWhereUniqueInput[];
    disconnect?: Prisma.PromotionPriceWhereUniqueInput | Prisma.PromotionPriceWhereUniqueInput[];
    delete?: Prisma.PromotionPriceWhereUniqueInput | Prisma.PromotionPriceWhereUniqueInput[];
    connect?: Prisma.PromotionPriceWhereUniqueInput | Prisma.PromotionPriceWhereUniqueInput[];
    update?: Prisma.PromotionPriceUpdateWithWhereUniqueWithoutPromotionInput | Prisma.PromotionPriceUpdateWithWhereUniqueWithoutPromotionInput[];
    updateMany?: Prisma.PromotionPriceUpdateManyWithWhereWithoutPromotionInput | Prisma.PromotionPriceUpdateManyWithWhereWithoutPromotionInput[];
    deleteMany?: Prisma.PromotionPriceScalarWhereInput | Prisma.PromotionPriceScalarWhereInput[];
};
export type PromotionPriceUncheckedUpdateManyWithoutPromotionNestedInput = {
    create?: Prisma.XOR<Prisma.PromotionPriceCreateWithoutPromotionInput, Prisma.PromotionPriceUncheckedCreateWithoutPromotionInput> | Prisma.PromotionPriceCreateWithoutPromotionInput[] | Prisma.PromotionPriceUncheckedCreateWithoutPromotionInput[];
    connectOrCreate?: Prisma.PromotionPriceCreateOrConnectWithoutPromotionInput | Prisma.PromotionPriceCreateOrConnectWithoutPromotionInput[];
    upsert?: Prisma.PromotionPriceUpsertWithWhereUniqueWithoutPromotionInput | Prisma.PromotionPriceUpsertWithWhereUniqueWithoutPromotionInput[];
    createMany?: Prisma.PromotionPriceCreateManyPromotionInputEnvelope;
    set?: Prisma.PromotionPriceWhereUniqueInput | Prisma.PromotionPriceWhereUniqueInput[];
    disconnect?: Prisma.PromotionPriceWhereUniqueInput | Prisma.PromotionPriceWhereUniqueInput[];
    delete?: Prisma.PromotionPriceWhereUniqueInput | Prisma.PromotionPriceWhereUniqueInput[];
    connect?: Prisma.PromotionPriceWhereUniqueInput | Prisma.PromotionPriceWhereUniqueInput[];
    update?: Prisma.PromotionPriceUpdateWithWhereUniqueWithoutPromotionInput | Prisma.PromotionPriceUpdateWithWhereUniqueWithoutPromotionInput[];
    updateMany?: Prisma.PromotionPriceUpdateManyWithWhereWithoutPromotionInput | Prisma.PromotionPriceUpdateManyWithWhereWithoutPromotionInput[];
    deleteMany?: Prisma.PromotionPriceScalarWhereInput | Prisma.PromotionPriceScalarWhereInput[];
};
export type PromotionPriceCreateWithoutVariantInput = {
    originalPrice: runtime.Decimal | runtime.DecimalJsLike | number | string;
    promotion: Prisma.PromotionCreateNestedOneWithoutPricesInput;
};
export type PromotionPriceUncheckedCreateWithoutVariantInput = {
    id?: number;
    promotionId: number;
    originalPrice: runtime.Decimal | runtime.DecimalJsLike | number | string;
};
export type PromotionPriceCreateOrConnectWithoutVariantInput = {
    where: Prisma.PromotionPriceWhereUniqueInput;
    create: Prisma.XOR<Prisma.PromotionPriceCreateWithoutVariantInput, Prisma.PromotionPriceUncheckedCreateWithoutVariantInput>;
};
export type PromotionPriceCreateManyVariantInputEnvelope = {
    data: Prisma.PromotionPriceCreateManyVariantInput | Prisma.PromotionPriceCreateManyVariantInput[];
    skipDuplicates?: boolean;
};
export type PromotionPriceUpsertWithWhereUniqueWithoutVariantInput = {
    where: Prisma.PromotionPriceWhereUniqueInput;
    update: Prisma.XOR<Prisma.PromotionPriceUpdateWithoutVariantInput, Prisma.PromotionPriceUncheckedUpdateWithoutVariantInput>;
    create: Prisma.XOR<Prisma.PromotionPriceCreateWithoutVariantInput, Prisma.PromotionPriceUncheckedCreateWithoutVariantInput>;
};
export type PromotionPriceUpdateWithWhereUniqueWithoutVariantInput = {
    where: Prisma.PromotionPriceWhereUniqueInput;
    data: Prisma.XOR<Prisma.PromotionPriceUpdateWithoutVariantInput, Prisma.PromotionPriceUncheckedUpdateWithoutVariantInput>;
};
export type PromotionPriceUpdateManyWithWhereWithoutVariantInput = {
    where: Prisma.PromotionPriceScalarWhereInput;
    data: Prisma.XOR<Prisma.PromotionPriceUpdateManyMutationInput, Prisma.PromotionPriceUncheckedUpdateManyWithoutVariantInput>;
};
export type PromotionPriceScalarWhereInput = {
    AND?: Prisma.PromotionPriceScalarWhereInput | Prisma.PromotionPriceScalarWhereInput[];
    OR?: Prisma.PromotionPriceScalarWhereInput[];
    NOT?: Prisma.PromotionPriceScalarWhereInput | Prisma.PromotionPriceScalarWhereInput[];
    id?: Prisma.IntFilter<"PromotionPrice"> | number;
    promotionId?: Prisma.IntFilter<"PromotionPrice"> | number;
    variantId?: Prisma.IntFilter<"PromotionPrice"> | number;
    originalPrice?: Prisma.DecimalFilter<"PromotionPrice"> | runtime.Decimal | runtime.DecimalJsLike | number | string;
};
export type PromotionPriceCreateWithoutPromotionInput = {
    originalPrice: runtime.Decimal | runtime.DecimalJsLike | number | string;
    variant: Prisma.ProductVariantCreateNestedOneWithoutPromotionPricesInput;
};
export type PromotionPriceUncheckedCreateWithoutPromotionInput = {
    id?: number;
    variantId: number;
    originalPrice: runtime.Decimal | runtime.DecimalJsLike | number | string;
};
export type PromotionPriceCreateOrConnectWithoutPromotionInput = {
    where: Prisma.PromotionPriceWhereUniqueInput;
    create: Prisma.XOR<Prisma.PromotionPriceCreateWithoutPromotionInput, Prisma.PromotionPriceUncheckedCreateWithoutPromotionInput>;
};
export type PromotionPriceCreateManyPromotionInputEnvelope = {
    data: Prisma.PromotionPriceCreateManyPromotionInput | Prisma.PromotionPriceCreateManyPromotionInput[];
    skipDuplicates?: boolean;
};
export type PromotionPriceUpsertWithWhereUniqueWithoutPromotionInput = {
    where: Prisma.PromotionPriceWhereUniqueInput;
    update: Prisma.XOR<Prisma.PromotionPriceUpdateWithoutPromotionInput, Prisma.PromotionPriceUncheckedUpdateWithoutPromotionInput>;
    create: Prisma.XOR<Prisma.PromotionPriceCreateWithoutPromotionInput, Prisma.PromotionPriceUncheckedCreateWithoutPromotionInput>;
};
export type PromotionPriceUpdateWithWhereUniqueWithoutPromotionInput = {
    where: Prisma.PromotionPriceWhereUniqueInput;
    data: Prisma.XOR<Prisma.PromotionPriceUpdateWithoutPromotionInput, Prisma.PromotionPriceUncheckedUpdateWithoutPromotionInput>;
};
export type PromotionPriceUpdateManyWithWhereWithoutPromotionInput = {
    where: Prisma.PromotionPriceScalarWhereInput;
    data: Prisma.XOR<Prisma.PromotionPriceUpdateManyMutationInput, Prisma.PromotionPriceUncheckedUpdateManyWithoutPromotionInput>;
};
export type PromotionPriceCreateManyVariantInput = {
    id?: number;
    promotionId: number;
    originalPrice: runtime.Decimal | runtime.DecimalJsLike | number | string;
};
export type PromotionPriceUpdateWithoutVariantInput = {
    originalPrice?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    promotion?: Prisma.PromotionUpdateOneRequiredWithoutPricesNestedInput;
};
export type PromotionPriceUncheckedUpdateWithoutVariantInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    promotionId?: Prisma.IntFieldUpdateOperationsInput | number;
    originalPrice?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
};
export type PromotionPriceUncheckedUpdateManyWithoutVariantInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    promotionId?: Prisma.IntFieldUpdateOperationsInput | number;
    originalPrice?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
};
export type PromotionPriceCreateManyPromotionInput = {
    id?: number;
    variantId: number;
    originalPrice: runtime.Decimal | runtime.DecimalJsLike | number | string;
};
export type PromotionPriceUpdateWithoutPromotionInput = {
    originalPrice?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    variant?: Prisma.ProductVariantUpdateOneRequiredWithoutPromotionPricesNestedInput;
};
export type PromotionPriceUncheckedUpdateWithoutPromotionInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    variantId?: Prisma.IntFieldUpdateOperationsInput | number;
    originalPrice?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
};
export type PromotionPriceUncheckedUpdateManyWithoutPromotionInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    variantId?: Prisma.IntFieldUpdateOperationsInput | number;
    originalPrice?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
};
export type PromotionPriceSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    promotionId?: boolean;
    variantId?: boolean;
    originalPrice?: boolean;
    promotion?: boolean | Prisma.PromotionDefaultArgs<ExtArgs>;
    variant?: boolean | Prisma.ProductVariantDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["promotionPrice"]>;
export type PromotionPriceSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    promotionId?: boolean;
    variantId?: boolean;
    originalPrice?: boolean;
    promotion?: boolean | Prisma.PromotionDefaultArgs<ExtArgs>;
    variant?: boolean | Prisma.ProductVariantDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["promotionPrice"]>;
export type PromotionPriceSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    promotionId?: boolean;
    variantId?: boolean;
    originalPrice?: boolean;
    promotion?: boolean | Prisma.PromotionDefaultArgs<ExtArgs>;
    variant?: boolean | Prisma.ProductVariantDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["promotionPrice"]>;
export type PromotionPriceSelectScalar = {
    id?: boolean;
    promotionId?: boolean;
    variantId?: boolean;
    originalPrice?: boolean;
};
export type PromotionPriceOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "promotionId" | "variantId" | "originalPrice", ExtArgs["result"]["promotionPrice"]>;
export type PromotionPriceInclude<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    promotion?: boolean | Prisma.PromotionDefaultArgs<ExtArgs>;
    variant?: boolean | Prisma.ProductVariantDefaultArgs<ExtArgs>;
};
export type PromotionPriceIncludeCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    promotion?: boolean | Prisma.PromotionDefaultArgs<ExtArgs>;
    variant?: boolean | Prisma.ProductVariantDefaultArgs<ExtArgs>;
};
export type PromotionPriceIncludeUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    promotion?: boolean | Prisma.PromotionDefaultArgs<ExtArgs>;
    variant?: boolean | Prisma.ProductVariantDefaultArgs<ExtArgs>;
};
export type $PromotionPricePayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "PromotionPrice";
    objects: {
        promotion: Prisma.$PromotionPayload<ExtArgs>;
        variant: Prisma.$ProductVariantPayload<ExtArgs>;
    };
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: number;
        promotionId: number;
        variantId: number;
        originalPrice: runtime.Decimal;
    }, ExtArgs["result"]["promotionPrice"]>;
    composites: {};
};
export type PromotionPriceGetPayload<S extends boolean | null | undefined | PromotionPriceDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$PromotionPricePayload, S>;
export type PromotionPriceCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<PromotionPriceFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: PromotionPriceCountAggregateInputType | true;
};
export interface PromotionPriceDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['PromotionPrice'];
        meta: {
            name: 'PromotionPrice';
        };
    };
    /**
     * Find zero or one PromotionPrice that matches the filter.
     * @param {PromotionPriceFindUniqueArgs} args - Arguments to find a PromotionPrice
     * @example
     * // Get one PromotionPrice
     * const promotionPrice = await prisma.promotionPrice.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends PromotionPriceFindUniqueArgs>(args: Prisma.SelectSubset<T, PromotionPriceFindUniqueArgs<ExtArgs>>): Prisma.Prisma__PromotionPriceClient<runtime.Types.Result.GetResult<Prisma.$PromotionPricePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find one PromotionPrice that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {PromotionPriceFindUniqueOrThrowArgs} args - Arguments to find a PromotionPrice
     * @example
     * // Get one PromotionPrice
     * const promotionPrice = await prisma.promotionPrice.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends PromotionPriceFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, PromotionPriceFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__PromotionPriceClient<runtime.Types.Result.GetResult<Prisma.$PromotionPricePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first PromotionPrice that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PromotionPriceFindFirstArgs} args - Arguments to find a PromotionPrice
     * @example
     * // Get one PromotionPrice
     * const promotionPrice = await prisma.promotionPrice.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends PromotionPriceFindFirstArgs>(args?: Prisma.SelectSubset<T, PromotionPriceFindFirstArgs<ExtArgs>>): Prisma.Prisma__PromotionPriceClient<runtime.Types.Result.GetResult<Prisma.$PromotionPricePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first PromotionPrice that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PromotionPriceFindFirstOrThrowArgs} args - Arguments to find a PromotionPrice
     * @example
     * // Get one PromotionPrice
     * const promotionPrice = await prisma.promotionPrice.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends PromotionPriceFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, PromotionPriceFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__PromotionPriceClient<runtime.Types.Result.GetResult<Prisma.$PromotionPricePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find zero or more PromotionPrices that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PromotionPriceFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all PromotionPrices
     * const promotionPrices = await prisma.promotionPrice.findMany()
     *
     * // Get first 10 PromotionPrices
     * const promotionPrices = await prisma.promotionPrice.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const promotionPriceWithIdOnly = await prisma.promotionPrice.findMany({ select: { id: true } })
     *
     */
    findMany<T extends PromotionPriceFindManyArgs>(args?: Prisma.SelectSubset<T, PromotionPriceFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$PromotionPricePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    /**
     * Create a PromotionPrice.
     * @param {PromotionPriceCreateArgs} args - Arguments to create a PromotionPrice.
     * @example
     * // Create one PromotionPrice
     * const PromotionPrice = await prisma.promotionPrice.create({
     *   data: {
     *     // ... data to create a PromotionPrice
     *   }
     * })
     *
     */
    create<T extends PromotionPriceCreateArgs>(args: Prisma.SelectSubset<T, PromotionPriceCreateArgs<ExtArgs>>): Prisma.Prisma__PromotionPriceClient<runtime.Types.Result.GetResult<Prisma.$PromotionPricePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Create many PromotionPrices.
     * @param {PromotionPriceCreateManyArgs} args - Arguments to create many PromotionPrices.
     * @example
     * // Create many PromotionPrices
     * const promotionPrice = await prisma.promotionPrice.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends PromotionPriceCreateManyArgs>(args?: Prisma.SelectSubset<T, PromotionPriceCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Create many PromotionPrices and returns the data saved in the database.
     * @param {PromotionPriceCreateManyAndReturnArgs} args - Arguments to create many PromotionPrices.
     * @example
     * // Create many PromotionPrices
     * const promotionPrice = await prisma.promotionPrice.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many PromotionPrices and only return the `id`
     * const promotionPriceWithIdOnly = await prisma.promotionPrice.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends PromotionPriceCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, PromotionPriceCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$PromotionPricePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    /**
     * Delete a PromotionPrice.
     * @param {PromotionPriceDeleteArgs} args - Arguments to delete one PromotionPrice.
     * @example
     * // Delete one PromotionPrice
     * const PromotionPrice = await prisma.promotionPrice.delete({
     *   where: {
     *     // ... filter to delete one PromotionPrice
     *   }
     * })
     *
     */
    delete<T extends PromotionPriceDeleteArgs>(args: Prisma.SelectSubset<T, PromotionPriceDeleteArgs<ExtArgs>>): Prisma.Prisma__PromotionPriceClient<runtime.Types.Result.GetResult<Prisma.$PromotionPricePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Update one PromotionPrice.
     * @param {PromotionPriceUpdateArgs} args - Arguments to update one PromotionPrice.
     * @example
     * // Update one PromotionPrice
     * const promotionPrice = await prisma.promotionPrice.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends PromotionPriceUpdateArgs>(args: Prisma.SelectSubset<T, PromotionPriceUpdateArgs<ExtArgs>>): Prisma.Prisma__PromotionPriceClient<runtime.Types.Result.GetResult<Prisma.$PromotionPricePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Delete zero or more PromotionPrices.
     * @param {PromotionPriceDeleteManyArgs} args - Arguments to filter PromotionPrices to delete.
     * @example
     * // Delete a few PromotionPrices
     * const { count } = await prisma.promotionPrice.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends PromotionPriceDeleteManyArgs>(args?: Prisma.SelectSubset<T, PromotionPriceDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more PromotionPrices.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PromotionPriceUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many PromotionPrices
     * const promotionPrice = await prisma.promotionPrice.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends PromotionPriceUpdateManyArgs>(args: Prisma.SelectSubset<T, PromotionPriceUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more PromotionPrices and returns the data updated in the database.
     * @param {PromotionPriceUpdateManyAndReturnArgs} args - Arguments to update many PromotionPrices.
     * @example
     * // Update many PromotionPrices
     * const promotionPrice = await prisma.promotionPrice.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more PromotionPrices and only return the `id`
     * const promotionPriceWithIdOnly = await prisma.promotionPrice.updateManyAndReturn({
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
    updateManyAndReturn<T extends PromotionPriceUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, PromotionPriceUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$PromotionPricePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    /**
     * Create or update one PromotionPrice.
     * @param {PromotionPriceUpsertArgs} args - Arguments to update or create a PromotionPrice.
     * @example
     * // Update or create a PromotionPrice
     * const promotionPrice = await prisma.promotionPrice.upsert({
     *   create: {
     *     // ... data to create a PromotionPrice
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the PromotionPrice we want to update
     *   }
     * })
     */
    upsert<T extends PromotionPriceUpsertArgs>(args: Prisma.SelectSubset<T, PromotionPriceUpsertArgs<ExtArgs>>): Prisma.Prisma__PromotionPriceClient<runtime.Types.Result.GetResult<Prisma.$PromotionPricePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Count the number of PromotionPrices.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PromotionPriceCountArgs} args - Arguments to filter PromotionPrices to count.
     * @example
     * // Count the number of PromotionPrices
     * const count = await prisma.promotionPrice.count({
     *   where: {
     *     // ... the filter for the PromotionPrices we want to count
     *   }
     * })
    **/
    count<T extends PromotionPriceCountArgs>(args?: Prisma.Subset<T, PromotionPriceCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], PromotionPriceCountAggregateOutputType> : number>;
    /**
     * Allows you to perform aggregations operations on a PromotionPrice.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PromotionPriceAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends PromotionPriceAggregateArgs>(args: Prisma.Subset<T, PromotionPriceAggregateArgs>): Prisma.PrismaPromise<GetPromotionPriceAggregateType<T>>;
    /**
     * Group by PromotionPrice.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PromotionPriceGroupByArgs} args - Group by arguments.
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
    groupBy<T extends PromotionPriceGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: PromotionPriceGroupByArgs['orderBy'];
    } : {
        orderBy?: PromotionPriceGroupByArgs['orderBy'];
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
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, PromotionPriceGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetPromotionPriceGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the PromotionPrice model
     */
    readonly fields: PromotionPriceFieldRefs;
}
/**
 * The delegate class that acts as a "Promise-like" for PromotionPrice.
 * Why is this prefixed with `Prisma__`?
 * Because we want to prevent naming conflicts as mentioned in
 * https://github.com/prisma/prisma-client-js/issues/707
 */
export interface Prisma__PromotionPriceClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    promotion<T extends Prisma.PromotionDefaultArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.PromotionDefaultArgs<ExtArgs>>): Prisma.Prisma__PromotionClient<runtime.Types.Result.GetResult<Prisma.$PromotionPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>;
    variant<T extends Prisma.ProductVariantDefaultArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.ProductVariantDefaultArgs<ExtArgs>>): Prisma.Prisma__ProductVariantClient<runtime.Types.Result.GetResult<Prisma.$ProductVariantPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>;
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
 * Fields of the PromotionPrice model
 */
export interface PromotionPriceFieldRefs {
    readonly id: Prisma.FieldRef<"PromotionPrice", 'Int'>;
    readonly promotionId: Prisma.FieldRef<"PromotionPrice", 'Int'>;
    readonly variantId: Prisma.FieldRef<"PromotionPrice", 'Int'>;
    readonly originalPrice: Prisma.FieldRef<"PromotionPrice", 'Decimal'>;
}
/**
 * PromotionPrice findUnique
 */
export type PromotionPriceFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which PromotionPrice to fetch.
     */
    where: Prisma.PromotionPriceWhereUniqueInput;
};
/**
 * PromotionPrice findUniqueOrThrow
 */
export type PromotionPriceFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which PromotionPrice to fetch.
     */
    where: Prisma.PromotionPriceWhereUniqueInput;
};
/**
 * PromotionPrice findFirst
 */
export type PromotionPriceFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which PromotionPrice to fetch.
     */
    where?: Prisma.PromotionPriceWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of PromotionPrices to fetch.
     */
    orderBy?: Prisma.PromotionPriceOrderByWithRelationInput | Prisma.PromotionPriceOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for PromotionPrices.
     */
    cursor?: Prisma.PromotionPriceWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` PromotionPrices from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` PromotionPrices.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of PromotionPrices.
     */
    distinct?: Prisma.PromotionPriceScalarFieldEnum | Prisma.PromotionPriceScalarFieldEnum[];
};
/**
 * PromotionPrice findFirstOrThrow
 */
export type PromotionPriceFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which PromotionPrice to fetch.
     */
    where?: Prisma.PromotionPriceWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of PromotionPrices to fetch.
     */
    orderBy?: Prisma.PromotionPriceOrderByWithRelationInput | Prisma.PromotionPriceOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for PromotionPrices.
     */
    cursor?: Prisma.PromotionPriceWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` PromotionPrices from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` PromotionPrices.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of PromotionPrices.
     */
    distinct?: Prisma.PromotionPriceScalarFieldEnum | Prisma.PromotionPriceScalarFieldEnum[];
};
/**
 * PromotionPrice findMany
 */
export type PromotionPriceFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which PromotionPrices to fetch.
     */
    where?: Prisma.PromotionPriceWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of PromotionPrices to fetch.
     */
    orderBy?: Prisma.PromotionPriceOrderByWithRelationInput | Prisma.PromotionPriceOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing PromotionPrices.
     */
    cursor?: Prisma.PromotionPriceWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` PromotionPrices from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` PromotionPrices.
     */
    skip?: number;
    distinct?: Prisma.PromotionPriceScalarFieldEnum | Prisma.PromotionPriceScalarFieldEnum[];
};
/**
 * PromotionPrice create
 */
export type PromotionPriceCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The data needed to create a PromotionPrice.
     */
    data: Prisma.XOR<Prisma.PromotionPriceCreateInput, Prisma.PromotionPriceUncheckedCreateInput>;
};
/**
 * PromotionPrice createMany
 */
export type PromotionPriceCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to create many PromotionPrices.
     */
    data: Prisma.PromotionPriceCreateManyInput | Prisma.PromotionPriceCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * PromotionPrice createManyAndReturn
 */
export type PromotionPriceCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PromotionPrice
     */
    select?: Prisma.PromotionPriceSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the PromotionPrice
     */
    omit?: Prisma.PromotionPriceOmit<ExtArgs> | null;
    /**
     * The data used to create many PromotionPrices.
     */
    data: Prisma.PromotionPriceCreateManyInput | Prisma.PromotionPriceCreateManyInput[];
    skipDuplicates?: boolean;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.PromotionPriceIncludeCreateManyAndReturn<ExtArgs> | null;
};
/**
 * PromotionPrice update
 */
export type PromotionPriceUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The data needed to update a PromotionPrice.
     */
    data: Prisma.XOR<Prisma.PromotionPriceUpdateInput, Prisma.PromotionPriceUncheckedUpdateInput>;
    /**
     * Choose, which PromotionPrice to update.
     */
    where: Prisma.PromotionPriceWhereUniqueInput;
};
/**
 * PromotionPrice updateMany
 */
export type PromotionPriceUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to update PromotionPrices.
     */
    data: Prisma.XOR<Prisma.PromotionPriceUpdateManyMutationInput, Prisma.PromotionPriceUncheckedUpdateManyInput>;
    /**
     * Filter which PromotionPrices to update
     */
    where?: Prisma.PromotionPriceWhereInput;
    /**
     * Limit how many PromotionPrices to update.
     */
    limit?: number;
};
/**
 * PromotionPrice updateManyAndReturn
 */
export type PromotionPriceUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PromotionPrice
     */
    select?: Prisma.PromotionPriceSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the PromotionPrice
     */
    omit?: Prisma.PromotionPriceOmit<ExtArgs> | null;
    /**
     * The data used to update PromotionPrices.
     */
    data: Prisma.XOR<Prisma.PromotionPriceUpdateManyMutationInput, Prisma.PromotionPriceUncheckedUpdateManyInput>;
    /**
     * Filter which PromotionPrices to update
     */
    where?: Prisma.PromotionPriceWhereInput;
    /**
     * Limit how many PromotionPrices to update.
     */
    limit?: number;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.PromotionPriceIncludeUpdateManyAndReturn<ExtArgs> | null;
};
/**
 * PromotionPrice upsert
 */
export type PromotionPriceUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The filter to search for the PromotionPrice to update in case it exists.
     */
    where: Prisma.PromotionPriceWhereUniqueInput;
    /**
     * In case the PromotionPrice found by the `where` argument doesn't exist, create a new PromotionPrice with this data.
     */
    create: Prisma.XOR<Prisma.PromotionPriceCreateInput, Prisma.PromotionPriceUncheckedCreateInput>;
    /**
     * In case the PromotionPrice was found with the provided `where` argument, update it with this data.
     */
    update: Prisma.XOR<Prisma.PromotionPriceUpdateInput, Prisma.PromotionPriceUncheckedUpdateInput>;
};
/**
 * PromotionPrice delete
 */
export type PromotionPriceDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter which PromotionPrice to delete.
     */
    where: Prisma.PromotionPriceWhereUniqueInput;
};
/**
 * PromotionPrice deleteMany
 */
export type PromotionPriceDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which PromotionPrices to delete
     */
    where?: Prisma.PromotionPriceWhereInput;
    /**
     * Limit how many PromotionPrices to delete.
     */
    limit?: number;
};
/**
 * PromotionPrice without action
 */
export type PromotionPriceDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
};
export {};
//# sourceMappingURL=PromotionPrice.d.ts.map