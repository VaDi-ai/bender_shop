import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace";
/**
 * Model PriceChange
 *
 */
export type PriceChangeModel = runtime.Types.Result.DefaultSelection<Prisma.$PriceChangePayload>;
export type AggregatePriceChange = {
    _count: PriceChangeCountAggregateOutputType | null;
    _avg: PriceChangeAvgAggregateOutputType | null;
    _sum: PriceChangeSumAggregateOutputType | null;
    _min: PriceChangeMinAggregateOutputType | null;
    _max: PriceChangeMaxAggregateOutputType | null;
};
export type PriceChangeAvgAggregateOutputType = {
    id: number | null;
    variantId: number | null;
    oldPrice: runtime.Decimal | null;
    newPrice: runtime.Decimal | null;
    markup: runtime.Decimal | null;
};
export type PriceChangeSumAggregateOutputType = {
    id: number | null;
    variantId: number | null;
    oldPrice: runtime.Decimal | null;
    newPrice: runtime.Decimal | null;
    markup: runtime.Decimal | null;
};
export type PriceChangeMinAggregateOutputType = {
    id: number | null;
    variantId: number | null;
    oldPrice: runtime.Decimal | null;
    newPrice: runtime.Decimal | null;
    source: string | null;
    markup: runtime.Decimal | null;
    comment: string | null;
    createdAt: Date | null;
    createdBy: string | null;
};
export type PriceChangeMaxAggregateOutputType = {
    id: number | null;
    variantId: number | null;
    oldPrice: runtime.Decimal | null;
    newPrice: runtime.Decimal | null;
    source: string | null;
    markup: runtime.Decimal | null;
    comment: string | null;
    createdAt: Date | null;
    createdBy: string | null;
};
export type PriceChangeCountAggregateOutputType = {
    id: number;
    variantId: number;
    oldPrice: number;
    newPrice: number;
    source: number;
    markup: number;
    comment: number;
    createdAt: number;
    createdBy: number;
    _all: number;
};
export type PriceChangeAvgAggregateInputType = {
    id?: true;
    variantId?: true;
    oldPrice?: true;
    newPrice?: true;
    markup?: true;
};
export type PriceChangeSumAggregateInputType = {
    id?: true;
    variantId?: true;
    oldPrice?: true;
    newPrice?: true;
    markup?: true;
};
export type PriceChangeMinAggregateInputType = {
    id?: true;
    variantId?: true;
    oldPrice?: true;
    newPrice?: true;
    source?: true;
    markup?: true;
    comment?: true;
    createdAt?: true;
    createdBy?: true;
};
export type PriceChangeMaxAggregateInputType = {
    id?: true;
    variantId?: true;
    oldPrice?: true;
    newPrice?: true;
    source?: true;
    markup?: true;
    comment?: true;
    createdAt?: true;
    createdBy?: true;
};
export type PriceChangeCountAggregateInputType = {
    id?: true;
    variantId?: true;
    oldPrice?: true;
    newPrice?: true;
    source?: true;
    markup?: true;
    comment?: true;
    createdAt?: true;
    createdBy?: true;
    _all?: true;
};
export type PriceChangeAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which PriceChange to aggregate.
     */
    where?: Prisma.PriceChangeWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of PriceChanges to fetch.
     */
    orderBy?: Prisma.PriceChangeOrderByWithRelationInput | Prisma.PriceChangeOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: Prisma.PriceChangeWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` PriceChanges from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` PriceChanges.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned PriceChanges
    **/
    _count?: true | PriceChangeCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to average
    **/
    _avg?: PriceChangeAvgAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to sum
    **/
    _sum?: PriceChangeSumAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
    **/
    _min?: PriceChangeMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
    **/
    _max?: PriceChangeMaxAggregateInputType;
};
export type GetPriceChangeAggregateType<T extends PriceChangeAggregateArgs> = {
    [P in keyof T & keyof AggregatePriceChange]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregatePriceChange[P]> : Prisma.GetScalarType<T[P], AggregatePriceChange[P]>;
};
export type PriceChangeGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.PriceChangeWhereInput;
    orderBy?: Prisma.PriceChangeOrderByWithAggregationInput | Prisma.PriceChangeOrderByWithAggregationInput[];
    by: Prisma.PriceChangeScalarFieldEnum[] | Prisma.PriceChangeScalarFieldEnum;
    having?: Prisma.PriceChangeScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: PriceChangeCountAggregateInputType | true;
    _avg?: PriceChangeAvgAggregateInputType;
    _sum?: PriceChangeSumAggregateInputType;
    _min?: PriceChangeMinAggregateInputType;
    _max?: PriceChangeMaxAggregateInputType;
};
export type PriceChangeGroupByOutputType = {
    id: number;
    variantId: number;
    oldPrice: runtime.Decimal;
    newPrice: runtime.Decimal;
    source: string;
    markup: runtime.Decimal | null;
    comment: string | null;
    createdAt: Date;
    createdBy: string;
    _count: PriceChangeCountAggregateOutputType | null;
    _avg: PriceChangeAvgAggregateOutputType | null;
    _sum: PriceChangeSumAggregateOutputType | null;
    _min: PriceChangeMinAggregateOutputType | null;
    _max: PriceChangeMaxAggregateOutputType | null;
};
type GetPriceChangeGroupByPayload<T extends PriceChangeGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<PriceChangeGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof PriceChangeGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], PriceChangeGroupByOutputType[P]> : Prisma.GetScalarType<T[P], PriceChangeGroupByOutputType[P]>;
}>>;
export type PriceChangeWhereInput = {
    AND?: Prisma.PriceChangeWhereInput | Prisma.PriceChangeWhereInput[];
    OR?: Prisma.PriceChangeWhereInput[];
    NOT?: Prisma.PriceChangeWhereInput | Prisma.PriceChangeWhereInput[];
    id?: Prisma.IntFilter<"PriceChange"> | number;
    variantId?: Prisma.IntFilter<"PriceChange"> | number;
    oldPrice?: Prisma.DecimalFilter<"PriceChange"> | runtime.Decimal | runtime.DecimalJsLike | number | string;
    newPrice?: Prisma.DecimalFilter<"PriceChange"> | runtime.Decimal | runtime.DecimalJsLike | number | string;
    source?: Prisma.StringFilter<"PriceChange"> | string;
    markup?: Prisma.DecimalNullableFilter<"PriceChange"> | runtime.Decimal | runtime.DecimalJsLike | number | string | null;
    comment?: Prisma.StringNullableFilter<"PriceChange"> | string | null;
    createdAt?: Prisma.DateTimeFilter<"PriceChange"> | Date | string;
    createdBy?: Prisma.StringFilter<"PriceChange"> | string;
    variant?: Prisma.XOR<Prisma.ProductVariantScalarRelationFilter, Prisma.ProductVariantWhereInput>;
};
export type PriceChangeOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    variantId?: Prisma.SortOrder;
    oldPrice?: Prisma.SortOrder;
    newPrice?: Prisma.SortOrder;
    source?: Prisma.SortOrder;
    markup?: Prisma.SortOrderInput | Prisma.SortOrder;
    comment?: Prisma.SortOrderInput | Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    createdBy?: Prisma.SortOrder;
    variant?: Prisma.ProductVariantOrderByWithRelationInput;
};
export type PriceChangeWhereUniqueInput = Prisma.AtLeast<{
    id?: number;
    AND?: Prisma.PriceChangeWhereInput | Prisma.PriceChangeWhereInput[];
    OR?: Prisma.PriceChangeWhereInput[];
    NOT?: Prisma.PriceChangeWhereInput | Prisma.PriceChangeWhereInput[];
    variantId?: Prisma.IntFilter<"PriceChange"> | number;
    oldPrice?: Prisma.DecimalFilter<"PriceChange"> | runtime.Decimal | runtime.DecimalJsLike | number | string;
    newPrice?: Prisma.DecimalFilter<"PriceChange"> | runtime.Decimal | runtime.DecimalJsLike | number | string;
    source?: Prisma.StringFilter<"PriceChange"> | string;
    markup?: Prisma.DecimalNullableFilter<"PriceChange"> | runtime.Decimal | runtime.DecimalJsLike | number | string | null;
    comment?: Prisma.StringNullableFilter<"PriceChange"> | string | null;
    createdAt?: Prisma.DateTimeFilter<"PriceChange"> | Date | string;
    createdBy?: Prisma.StringFilter<"PriceChange"> | string;
    variant?: Prisma.XOR<Prisma.ProductVariantScalarRelationFilter, Prisma.ProductVariantWhereInput>;
}, "id">;
export type PriceChangeOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    variantId?: Prisma.SortOrder;
    oldPrice?: Prisma.SortOrder;
    newPrice?: Prisma.SortOrder;
    source?: Prisma.SortOrder;
    markup?: Prisma.SortOrderInput | Prisma.SortOrder;
    comment?: Prisma.SortOrderInput | Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    createdBy?: Prisma.SortOrder;
    _count?: Prisma.PriceChangeCountOrderByAggregateInput;
    _avg?: Prisma.PriceChangeAvgOrderByAggregateInput;
    _max?: Prisma.PriceChangeMaxOrderByAggregateInput;
    _min?: Prisma.PriceChangeMinOrderByAggregateInput;
    _sum?: Prisma.PriceChangeSumOrderByAggregateInput;
};
export type PriceChangeScalarWhereWithAggregatesInput = {
    AND?: Prisma.PriceChangeScalarWhereWithAggregatesInput | Prisma.PriceChangeScalarWhereWithAggregatesInput[];
    OR?: Prisma.PriceChangeScalarWhereWithAggregatesInput[];
    NOT?: Prisma.PriceChangeScalarWhereWithAggregatesInput | Prisma.PriceChangeScalarWhereWithAggregatesInput[];
    id?: Prisma.IntWithAggregatesFilter<"PriceChange"> | number;
    variantId?: Prisma.IntWithAggregatesFilter<"PriceChange"> | number;
    oldPrice?: Prisma.DecimalWithAggregatesFilter<"PriceChange"> | runtime.Decimal | runtime.DecimalJsLike | number | string;
    newPrice?: Prisma.DecimalWithAggregatesFilter<"PriceChange"> | runtime.Decimal | runtime.DecimalJsLike | number | string;
    source?: Prisma.StringWithAggregatesFilter<"PriceChange"> | string;
    markup?: Prisma.DecimalNullableWithAggregatesFilter<"PriceChange"> | runtime.Decimal | runtime.DecimalJsLike | number | string | null;
    comment?: Prisma.StringNullableWithAggregatesFilter<"PriceChange"> | string | null;
    createdAt?: Prisma.DateTimeWithAggregatesFilter<"PriceChange"> | Date | string;
    createdBy?: Prisma.StringWithAggregatesFilter<"PriceChange"> | string;
};
export type PriceChangeCreateInput = {
    oldPrice: runtime.Decimal | runtime.DecimalJsLike | number | string;
    newPrice: runtime.Decimal | runtime.DecimalJsLike | number | string;
    source: string;
    markup?: runtime.Decimal | runtime.DecimalJsLike | number | string | null;
    comment?: string | null;
    createdAt?: Date | string;
    createdBy: string;
    variant: Prisma.ProductVariantCreateNestedOneWithoutPriceChangesInput;
};
export type PriceChangeUncheckedCreateInput = {
    id?: number;
    variantId: number;
    oldPrice: runtime.Decimal | runtime.DecimalJsLike | number | string;
    newPrice: runtime.Decimal | runtime.DecimalJsLike | number | string;
    source: string;
    markup?: runtime.Decimal | runtime.DecimalJsLike | number | string | null;
    comment?: string | null;
    createdAt?: Date | string;
    createdBy: string;
};
export type PriceChangeUpdateInput = {
    oldPrice?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    newPrice?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    source?: Prisma.StringFieldUpdateOperationsInput | string;
    markup?: Prisma.NullableDecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string | null;
    comment?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    createdBy?: Prisma.StringFieldUpdateOperationsInput | string;
    variant?: Prisma.ProductVariantUpdateOneRequiredWithoutPriceChangesNestedInput;
};
export type PriceChangeUncheckedUpdateInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    variantId?: Prisma.IntFieldUpdateOperationsInput | number;
    oldPrice?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    newPrice?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    source?: Prisma.StringFieldUpdateOperationsInput | string;
    markup?: Prisma.NullableDecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string | null;
    comment?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    createdBy?: Prisma.StringFieldUpdateOperationsInput | string;
};
export type PriceChangeCreateManyInput = {
    id?: number;
    variantId: number;
    oldPrice: runtime.Decimal | runtime.DecimalJsLike | number | string;
    newPrice: runtime.Decimal | runtime.DecimalJsLike | number | string;
    source: string;
    markup?: runtime.Decimal | runtime.DecimalJsLike | number | string | null;
    comment?: string | null;
    createdAt?: Date | string;
    createdBy: string;
};
export type PriceChangeUpdateManyMutationInput = {
    oldPrice?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    newPrice?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    source?: Prisma.StringFieldUpdateOperationsInput | string;
    markup?: Prisma.NullableDecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string | null;
    comment?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    createdBy?: Prisma.StringFieldUpdateOperationsInput | string;
};
export type PriceChangeUncheckedUpdateManyInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    variantId?: Prisma.IntFieldUpdateOperationsInput | number;
    oldPrice?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    newPrice?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    source?: Prisma.StringFieldUpdateOperationsInput | string;
    markup?: Prisma.NullableDecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string | null;
    comment?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    createdBy?: Prisma.StringFieldUpdateOperationsInput | string;
};
export type PriceChangeListRelationFilter = {
    every?: Prisma.PriceChangeWhereInput;
    some?: Prisma.PriceChangeWhereInput;
    none?: Prisma.PriceChangeWhereInput;
};
export type PriceChangeOrderByRelationAggregateInput = {
    _count?: Prisma.SortOrder;
};
export type PriceChangeCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    variantId?: Prisma.SortOrder;
    oldPrice?: Prisma.SortOrder;
    newPrice?: Prisma.SortOrder;
    source?: Prisma.SortOrder;
    markup?: Prisma.SortOrder;
    comment?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    createdBy?: Prisma.SortOrder;
};
export type PriceChangeAvgOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    variantId?: Prisma.SortOrder;
    oldPrice?: Prisma.SortOrder;
    newPrice?: Prisma.SortOrder;
    markup?: Prisma.SortOrder;
};
export type PriceChangeMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    variantId?: Prisma.SortOrder;
    oldPrice?: Prisma.SortOrder;
    newPrice?: Prisma.SortOrder;
    source?: Prisma.SortOrder;
    markup?: Prisma.SortOrder;
    comment?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    createdBy?: Prisma.SortOrder;
};
export type PriceChangeMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    variantId?: Prisma.SortOrder;
    oldPrice?: Prisma.SortOrder;
    newPrice?: Prisma.SortOrder;
    source?: Prisma.SortOrder;
    markup?: Prisma.SortOrder;
    comment?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    createdBy?: Prisma.SortOrder;
};
export type PriceChangeSumOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    variantId?: Prisma.SortOrder;
    oldPrice?: Prisma.SortOrder;
    newPrice?: Prisma.SortOrder;
    markup?: Prisma.SortOrder;
};
export type PriceChangeCreateNestedManyWithoutVariantInput = {
    create?: Prisma.XOR<Prisma.PriceChangeCreateWithoutVariantInput, Prisma.PriceChangeUncheckedCreateWithoutVariantInput> | Prisma.PriceChangeCreateWithoutVariantInput[] | Prisma.PriceChangeUncheckedCreateWithoutVariantInput[];
    connectOrCreate?: Prisma.PriceChangeCreateOrConnectWithoutVariantInput | Prisma.PriceChangeCreateOrConnectWithoutVariantInput[];
    createMany?: Prisma.PriceChangeCreateManyVariantInputEnvelope;
    connect?: Prisma.PriceChangeWhereUniqueInput | Prisma.PriceChangeWhereUniqueInput[];
};
export type PriceChangeUncheckedCreateNestedManyWithoutVariantInput = {
    create?: Prisma.XOR<Prisma.PriceChangeCreateWithoutVariantInput, Prisma.PriceChangeUncheckedCreateWithoutVariantInput> | Prisma.PriceChangeCreateWithoutVariantInput[] | Prisma.PriceChangeUncheckedCreateWithoutVariantInput[];
    connectOrCreate?: Prisma.PriceChangeCreateOrConnectWithoutVariantInput | Prisma.PriceChangeCreateOrConnectWithoutVariantInput[];
    createMany?: Prisma.PriceChangeCreateManyVariantInputEnvelope;
    connect?: Prisma.PriceChangeWhereUniqueInput | Prisma.PriceChangeWhereUniqueInput[];
};
export type PriceChangeUpdateManyWithoutVariantNestedInput = {
    create?: Prisma.XOR<Prisma.PriceChangeCreateWithoutVariantInput, Prisma.PriceChangeUncheckedCreateWithoutVariantInput> | Prisma.PriceChangeCreateWithoutVariantInput[] | Prisma.PriceChangeUncheckedCreateWithoutVariantInput[];
    connectOrCreate?: Prisma.PriceChangeCreateOrConnectWithoutVariantInput | Prisma.PriceChangeCreateOrConnectWithoutVariantInput[];
    upsert?: Prisma.PriceChangeUpsertWithWhereUniqueWithoutVariantInput | Prisma.PriceChangeUpsertWithWhereUniqueWithoutVariantInput[];
    createMany?: Prisma.PriceChangeCreateManyVariantInputEnvelope;
    set?: Prisma.PriceChangeWhereUniqueInput | Prisma.PriceChangeWhereUniqueInput[];
    disconnect?: Prisma.PriceChangeWhereUniqueInput | Prisma.PriceChangeWhereUniqueInput[];
    delete?: Prisma.PriceChangeWhereUniqueInput | Prisma.PriceChangeWhereUniqueInput[];
    connect?: Prisma.PriceChangeWhereUniqueInput | Prisma.PriceChangeWhereUniqueInput[];
    update?: Prisma.PriceChangeUpdateWithWhereUniqueWithoutVariantInput | Prisma.PriceChangeUpdateWithWhereUniqueWithoutVariantInput[];
    updateMany?: Prisma.PriceChangeUpdateManyWithWhereWithoutVariantInput | Prisma.PriceChangeUpdateManyWithWhereWithoutVariantInput[];
    deleteMany?: Prisma.PriceChangeScalarWhereInput | Prisma.PriceChangeScalarWhereInput[];
};
export type PriceChangeUncheckedUpdateManyWithoutVariantNestedInput = {
    create?: Prisma.XOR<Prisma.PriceChangeCreateWithoutVariantInput, Prisma.PriceChangeUncheckedCreateWithoutVariantInput> | Prisma.PriceChangeCreateWithoutVariantInput[] | Prisma.PriceChangeUncheckedCreateWithoutVariantInput[];
    connectOrCreate?: Prisma.PriceChangeCreateOrConnectWithoutVariantInput | Prisma.PriceChangeCreateOrConnectWithoutVariantInput[];
    upsert?: Prisma.PriceChangeUpsertWithWhereUniqueWithoutVariantInput | Prisma.PriceChangeUpsertWithWhereUniqueWithoutVariantInput[];
    createMany?: Prisma.PriceChangeCreateManyVariantInputEnvelope;
    set?: Prisma.PriceChangeWhereUniqueInput | Prisma.PriceChangeWhereUniqueInput[];
    disconnect?: Prisma.PriceChangeWhereUniqueInput | Prisma.PriceChangeWhereUniqueInput[];
    delete?: Prisma.PriceChangeWhereUniqueInput | Prisma.PriceChangeWhereUniqueInput[];
    connect?: Prisma.PriceChangeWhereUniqueInput | Prisma.PriceChangeWhereUniqueInput[];
    update?: Prisma.PriceChangeUpdateWithWhereUniqueWithoutVariantInput | Prisma.PriceChangeUpdateWithWhereUniqueWithoutVariantInput[];
    updateMany?: Prisma.PriceChangeUpdateManyWithWhereWithoutVariantInput | Prisma.PriceChangeUpdateManyWithWhereWithoutVariantInput[];
    deleteMany?: Prisma.PriceChangeScalarWhereInput | Prisma.PriceChangeScalarWhereInput[];
};
export type NullableDecimalFieldUpdateOperationsInput = {
    set?: runtime.Decimal | runtime.DecimalJsLike | number | string | null;
    increment?: runtime.Decimal | runtime.DecimalJsLike | number | string;
    decrement?: runtime.Decimal | runtime.DecimalJsLike | number | string;
    multiply?: runtime.Decimal | runtime.DecimalJsLike | number | string;
    divide?: runtime.Decimal | runtime.DecimalJsLike | number | string;
};
export type PriceChangeCreateWithoutVariantInput = {
    oldPrice: runtime.Decimal | runtime.DecimalJsLike | number | string;
    newPrice: runtime.Decimal | runtime.DecimalJsLike | number | string;
    source: string;
    markup?: runtime.Decimal | runtime.DecimalJsLike | number | string | null;
    comment?: string | null;
    createdAt?: Date | string;
    createdBy: string;
};
export type PriceChangeUncheckedCreateWithoutVariantInput = {
    id?: number;
    oldPrice: runtime.Decimal | runtime.DecimalJsLike | number | string;
    newPrice: runtime.Decimal | runtime.DecimalJsLike | number | string;
    source: string;
    markup?: runtime.Decimal | runtime.DecimalJsLike | number | string | null;
    comment?: string | null;
    createdAt?: Date | string;
    createdBy: string;
};
export type PriceChangeCreateOrConnectWithoutVariantInput = {
    where: Prisma.PriceChangeWhereUniqueInput;
    create: Prisma.XOR<Prisma.PriceChangeCreateWithoutVariantInput, Prisma.PriceChangeUncheckedCreateWithoutVariantInput>;
};
export type PriceChangeCreateManyVariantInputEnvelope = {
    data: Prisma.PriceChangeCreateManyVariantInput | Prisma.PriceChangeCreateManyVariantInput[];
    skipDuplicates?: boolean;
};
export type PriceChangeUpsertWithWhereUniqueWithoutVariantInput = {
    where: Prisma.PriceChangeWhereUniqueInput;
    update: Prisma.XOR<Prisma.PriceChangeUpdateWithoutVariantInput, Prisma.PriceChangeUncheckedUpdateWithoutVariantInput>;
    create: Prisma.XOR<Prisma.PriceChangeCreateWithoutVariantInput, Prisma.PriceChangeUncheckedCreateWithoutVariantInput>;
};
export type PriceChangeUpdateWithWhereUniqueWithoutVariantInput = {
    where: Prisma.PriceChangeWhereUniqueInput;
    data: Prisma.XOR<Prisma.PriceChangeUpdateWithoutVariantInput, Prisma.PriceChangeUncheckedUpdateWithoutVariantInput>;
};
export type PriceChangeUpdateManyWithWhereWithoutVariantInput = {
    where: Prisma.PriceChangeScalarWhereInput;
    data: Prisma.XOR<Prisma.PriceChangeUpdateManyMutationInput, Prisma.PriceChangeUncheckedUpdateManyWithoutVariantInput>;
};
export type PriceChangeScalarWhereInput = {
    AND?: Prisma.PriceChangeScalarWhereInput | Prisma.PriceChangeScalarWhereInput[];
    OR?: Prisma.PriceChangeScalarWhereInput[];
    NOT?: Prisma.PriceChangeScalarWhereInput | Prisma.PriceChangeScalarWhereInput[];
    id?: Prisma.IntFilter<"PriceChange"> | number;
    variantId?: Prisma.IntFilter<"PriceChange"> | number;
    oldPrice?: Prisma.DecimalFilter<"PriceChange"> | runtime.Decimal | runtime.DecimalJsLike | number | string;
    newPrice?: Prisma.DecimalFilter<"PriceChange"> | runtime.Decimal | runtime.DecimalJsLike | number | string;
    source?: Prisma.StringFilter<"PriceChange"> | string;
    markup?: Prisma.DecimalNullableFilter<"PriceChange"> | runtime.Decimal | runtime.DecimalJsLike | number | string | null;
    comment?: Prisma.StringNullableFilter<"PriceChange"> | string | null;
    createdAt?: Prisma.DateTimeFilter<"PriceChange"> | Date | string;
    createdBy?: Prisma.StringFilter<"PriceChange"> | string;
};
export type PriceChangeCreateManyVariantInput = {
    id?: number;
    oldPrice: runtime.Decimal | runtime.DecimalJsLike | number | string;
    newPrice: runtime.Decimal | runtime.DecimalJsLike | number | string;
    source: string;
    markup?: runtime.Decimal | runtime.DecimalJsLike | number | string | null;
    comment?: string | null;
    createdAt?: Date | string;
    createdBy: string;
};
export type PriceChangeUpdateWithoutVariantInput = {
    oldPrice?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    newPrice?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    source?: Prisma.StringFieldUpdateOperationsInput | string;
    markup?: Prisma.NullableDecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string | null;
    comment?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    createdBy?: Prisma.StringFieldUpdateOperationsInput | string;
};
export type PriceChangeUncheckedUpdateWithoutVariantInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    oldPrice?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    newPrice?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    source?: Prisma.StringFieldUpdateOperationsInput | string;
    markup?: Prisma.NullableDecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string | null;
    comment?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    createdBy?: Prisma.StringFieldUpdateOperationsInput | string;
};
export type PriceChangeUncheckedUpdateManyWithoutVariantInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    oldPrice?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    newPrice?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    source?: Prisma.StringFieldUpdateOperationsInput | string;
    markup?: Prisma.NullableDecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string | null;
    comment?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    createdBy?: Prisma.StringFieldUpdateOperationsInput | string;
};
export type PriceChangeSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    variantId?: boolean;
    oldPrice?: boolean;
    newPrice?: boolean;
    source?: boolean;
    markup?: boolean;
    comment?: boolean;
    createdAt?: boolean;
    createdBy?: boolean;
    variant?: boolean | Prisma.ProductVariantDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["priceChange"]>;
export type PriceChangeSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    variantId?: boolean;
    oldPrice?: boolean;
    newPrice?: boolean;
    source?: boolean;
    markup?: boolean;
    comment?: boolean;
    createdAt?: boolean;
    createdBy?: boolean;
    variant?: boolean | Prisma.ProductVariantDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["priceChange"]>;
export type PriceChangeSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    variantId?: boolean;
    oldPrice?: boolean;
    newPrice?: boolean;
    source?: boolean;
    markup?: boolean;
    comment?: boolean;
    createdAt?: boolean;
    createdBy?: boolean;
    variant?: boolean | Prisma.ProductVariantDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["priceChange"]>;
export type PriceChangeSelectScalar = {
    id?: boolean;
    variantId?: boolean;
    oldPrice?: boolean;
    newPrice?: boolean;
    source?: boolean;
    markup?: boolean;
    comment?: boolean;
    createdAt?: boolean;
    createdBy?: boolean;
};
export type PriceChangeOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "variantId" | "oldPrice" | "newPrice" | "source" | "markup" | "comment" | "createdAt" | "createdBy", ExtArgs["result"]["priceChange"]>;
export type PriceChangeInclude<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    variant?: boolean | Prisma.ProductVariantDefaultArgs<ExtArgs>;
};
export type PriceChangeIncludeCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    variant?: boolean | Prisma.ProductVariantDefaultArgs<ExtArgs>;
};
export type PriceChangeIncludeUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    variant?: boolean | Prisma.ProductVariantDefaultArgs<ExtArgs>;
};
export type $PriceChangePayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "PriceChange";
    objects: {
        variant: Prisma.$ProductVariantPayload<ExtArgs>;
    };
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: number;
        variantId: number;
        oldPrice: runtime.Decimal;
        newPrice: runtime.Decimal;
        source: string;
        markup: runtime.Decimal | null;
        comment: string | null;
        createdAt: Date;
        createdBy: string;
    }, ExtArgs["result"]["priceChange"]>;
    composites: {};
};
export type PriceChangeGetPayload<S extends boolean | null | undefined | PriceChangeDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$PriceChangePayload, S>;
export type PriceChangeCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<PriceChangeFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: PriceChangeCountAggregateInputType | true;
};
export interface PriceChangeDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['PriceChange'];
        meta: {
            name: 'PriceChange';
        };
    };
    /**
     * Find zero or one PriceChange that matches the filter.
     * @param {PriceChangeFindUniqueArgs} args - Arguments to find a PriceChange
     * @example
     * // Get one PriceChange
     * const priceChange = await prisma.priceChange.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends PriceChangeFindUniqueArgs>(args: Prisma.SelectSubset<T, PriceChangeFindUniqueArgs<ExtArgs>>): Prisma.Prisma__PriceChangeClient<runtime.Types.Result.GetResult<Prisma.$PriceChangePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find one PriceChange that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {PriceChangeFindUniqueOrThrowArgs} args - Arguments to find a PriceChange
     * @example
     * // Get one PriceChange
     * const priceChange = await prisma.priceChange.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends PriceChangeFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, PriceChangeFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__PriceChangeClient<runtime.Types.Result.GetResult<Prisma.$PriceChangePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first PriceChange that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PriceChangeFindFirstArgs} args - Arguments to find a PriceChange
     * @example
     * // Get one PriceChange
     * const priceChange = await prisma.priceChange.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends PriceChangeFindFirstArgs>(args?: Prisma.SelectSubset<T, PriceChangeFindFirstArgs<ExtArgs>>): Prisma.Prisma__PriceChangeClient<runtime.Types.Result.GetResult<Prisma.$PriceChangePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first PriceChange that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PriceChangeFindFirstOrThrowArgs} args - Arguments to find a PriceChange
     * @example
     * // Get one PriceChange
     * const priceChange = await prisma.priceChange.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends PriceChangeFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, PriceChangeFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__PriceChangeClient<runtime.Types.Result.GetResult<Prisma.$PriceChangePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find zero or more PriceChanges that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PriceChangeFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all PriceChanges
     * const priceChanges = await prisma.priceChange.findMany()
     *
     * // Get first 10 PriceChanges
     * const priceChanges = await prisma.priceChange.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const priceChangeWithIdOnly = await prisma.priceChange.findMany({ select: { id: true } })
     *
     */
    findMany<T extends PriceChangeFindManyArgs>(args?: Prisma.SelectSubset<T, PriceChangeFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$PriceChangePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    /**
     * Create a PriceChange.
     * @param {PriceChangeCreateArgs} args - Arguments to create a PriceChange.
     * @example
     * // Create one PriceChange
     * const PriceChange = await prisma.priceChange.create({
     *   data: {
     *     // ... data to create a PriceChange
     *   }
     * })
     *
     */
    create<T extends PriceChangeCreateArgs>(args: Prisma.SelectSubset<T, PriceChangeCreateArgs<ExtArgs>>): Prisma.Prisma__PriceChangeClient<runtime.Types.Result.GetResult<Prisma.$PriceChangePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Create many PriceChanges.
     * @param {PriceChangeCreateManyArgs} args - Arguments to create many PriceChanges.
     * @example
     * // Create many PriceChanges
     * const priceChange = await prisma.priceChange.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends PriceChangeCreateManyArgs>(args?: Prisma.SelectSubset<T, PriceChangeCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Create many PriceChanges and returns the data saved in the database.
     * @param {PriceChangeCreateManyAndReturnArgs} args - Arguments to create many PriceChanges.
     * @example
     * // Create many PriceChanges
     * const priceChange = await prisma.priceChange.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many PriceChanges and only return the `id`
     * const priceChangeWithIdOnly = await prisma.priceChange.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends PriceChangeCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, PriceChangeCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$PriceChangePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    /**
     * Delete a PriceChange.
     * @param {PriceChangeDeleteArgs} args - Arguments to delete one PriceChange.
     * @example
     * // Delete one PriceChange
     * const PriceChange = await prisma.priceChange.delete({
     *   where: {
     *     // ... filter to delete one PriceChange
     *   }
     * })
     *
     */
    delete<T extends PriceChangeDeleteArgs>(args: Prisma.SelectSubset<T, PriceChangeDeleteArgs<ExtArgs>>): Prisma.Prisma__PriceChangeClient<runtime.Types.Result.GetResult<Prisma.$PriceChangePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Update one PriceChange.
     * @param {PriceChangeUpdateArgs} args - Arguments to update one PriceChange.
     * @example
     * // Update one PriceChange
     * const priceChange = await prisma.priceChange.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends PriceChangeUpdateArgs>(args: Prisma.SelectSubset<T, PriceChangeUpdateArgs<ExtArgs>>): Prisma.Prisma__PriceChangeClient<runtime.Types.Result.GetResult<Prisma.$PriceChangePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Delete zero or more PriceChanges.
     * @param {PriceChangeDeleteManyArgs} args - Arguments to filter PriceChanges to delete.
     * @example
     * // Delete a few PriceChanges
     * const { count } = await prisma.priceChange.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends PriceChangeDeleteManyArgs>(args?: Prisma.SelectSubset<T, PriceChangeDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more PriceChanges.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PriceChangeUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many PriceChanges
     * const priceChange = await prisma.priceChange.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends PriceChangeUpdateManyArgs>(args: Prisma.SelectSubset<T, PriceChangeUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more PriceChanges and returns the data updated in the database.
     * @param {PriceChangeUpdateManyAndReturnArgs} args - Arguments to update many PriceChanges.
     * @example
     * // Update many PriceChanges
     * const priceChange = await prisma.priceChange.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more PriceChanges and only return the `id`
     * const priceChangeWithIdOnly = await prisma.priceChange.updateManyAndReturn({
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
    updateManyAndReturn<T extends PriceChangeUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, PriceChangeUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$PriceChangePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    /**
     * Create or update one PriceChange.
     * @param {PriceChangeUpsertArgs} args - Arguments to update or create a PriceChange.
     * @example
     * // Update or create a PriceChange
     * const priceChange = await prisma.priceChange.upsert({
     *   create: {
     *     // ... data to create a PriceChange
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the PriceChange we want to update
     *   }
     * })
     */
    upsert<T extends PriceChangeUpsertArgs>(args: Prisma.SelectSubset<T, PriceChangeUpsertArgs<ExtArgs>>): Prisma.Prisma__PriceChangeClient<runtime.Types.Result.GetResult<Prisma.$PriceChangePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Count the number of PriceChanges.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PriceChangeCountArgs} args - Arguments to filter PriceChanges to count.
     * @example
     * // Count the number of PriceChanges
     * const count = await prisma.priceChange.count({
     *   where: {
     *     // ... the filter for the PriceChanges we want to count
     *   }
     * })
    **/
    count<T extends PriceChangeCountArgs>(args?: Prisma.Subset<T, PriceChangeCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], PriceChangeCountAggregateOutputType> : number>;
    /**
     * Allows you to perform aggregations operations on a PriceChange.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PriceChangeAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends PriceChangeAggregateArgs>(args: Prisma.Subset<T, PriceChangeAggregateArgs>): Prisma.PrismaPromise<GetPriceChangeAggregateType<T>>;
    /**
     * Group by PriceChange.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PriceChangeGroupByArgs} args - Group by arguments.
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
    groupBy<T extends PriceChangeGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: PriceChangeGroupByArgs['orderBy'];
    } : {
        orderBy?: PriceChangeGroupByArgs['orderBy'];
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
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, PriceChangeGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetPriceChangeGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the PriceChange model
     */
    readonly fields: PriceChangeFieldRefs;
}
/**
 * The delegate class that acts as a "Promise-like" for PriceChange.
 * Why is this prefixed with `Prisma__`?
 * Because we want to prevent naming conflicts as mentioned in
 * https://github.com/prisma/prisma-client-js/issues/707
 */
export interface Prisma__PriceChangeClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
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
 * Fields of the PriceChange model
 */
export interface PriceChangeFieldRefs {
    readonly id: Prisma.FieldRef<"PriceChange", 'Int'>;
    readonly variantId: Prisma.FieldRef<"PriceChange", 'Int'>;
    readonly oldPrice: Prisma.FieldRef<"PriceChange", 'Decimal'>;
    readonly newPrice: Prisma.FieldRef<"PriceChange", 'Decimal'>;
    readonly source: Prisma.FieldRef<"PriceChange", 'String'>;
    readonly markup: Prisma.FieldRef<"PriceChange", 'Decimal'>;
    readonly comment: Prisma.FieldRef<"PriceChange", 'String'>;
    readonly createdAt: Prisma.FieldRef<"PriceChange", 'DateTime'>;
    readonly createdBy: Prisma.FieldRef<"PriceChange", 'String'>;
}
/**
 * PriceChange findUnique
 */
export type PriceChangeFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which PriceChange to fetch.
     */
    where: Prisma.PriceChangeWhereUniqueInput;
};
/**
 * PriceChange findUniqueOrThrow
 */
export type PriceChangeFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which PriceChange to fetch.
     */
    where: Prisma.PriceChangeWhereUniqueInput;
};
/**
 * PriceChange findFirst
 */
export type PriceChangeFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which PriceChange to fetch.
     */
    where?: Prisma.PriceChangeWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of PriceChanges to fetch.
     */
    orderBy?: Prisma.PriceChangeOrderByWithRelationInput | Prisma.PriceChangeOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for PriceChanges.
     */
    cursor?: Prisma.PriceChangeWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` PriceChanges from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` PriceChanges.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of PriceChanges.
     */
    distinct?: Prisma.PriceChangeScalarFieldEnum | Prisma.PriceChangeScalarFieldEnum[];
};
/**
 * PriceChange findFirstOrThrow
 */
export type PriceChangeFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which PriceChange to fetch.
     */
    where?: Prisma.PriceChangeWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of PriceChanges to fetch.
     */
    orderBy?: Prisma.PriceChangeOrderByWithRelationInput | Prisma.PriceChangeOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for PriceChanges.
     */
    cursor?: Prisma.PriceChangeWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` PriceChanges from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` PriceChanges.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of PriceChanges.
     */
    distinct?: Prisma.PriceChangeScalarFieldEnum | Prisma.PriceChangeScalarFieldEnum[];
};
/**
 * PriceChange findMany
 */
export type PriceChangeFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which PriceChanges to fetch.
     */
    where?: Prisma.PriceChangeWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of PriceChanges to fetch.
     */
    orderBy?: Prisma.PriceChangeOrderByWithRelationInput | Prisma.PriceChangeOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing PriceChanges.
     */
    cursor?: Prisma.PriceChangeWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` PriceChanges from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` PriceChanges.
     */
    skip?: number;
    distinct?: Prisma.PriceChangeScalarFieldEnum | Prisma.PriceChangeScalarFieldEnum[];
};
/**
 * PriceChange create
 */
export type PriceChangeCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The data needed to create a PriceChange.
     */
    data: Prisma.XOR<Prisma.PriceChangeCreateInput, Prisma.PriceChangeUncheckedCreateInput>;
};
/**
 * PriceChange createMany
 */
export type PriceChangeCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to create many PriceChanges.
     */
    data: Prisma.PriceChangeCreateManyInput | Prisma.PriceChangeCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * PriceChange createManyAndReturn
 */
export type PriceChangeCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PriceChange
     */
    select?: Prisma.PriceChangeSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the PriceChange
     */
    omit?: Prisma.PriceChangeOmit<ExtArgs> | null;
    /**
     * The data used to create many PriceChanges.
     */
    data: Prisma.PriceChangeCreateManyInput | Prisma.PriceChangeCreateManyInput[];
    skipDuplicates?: boolean;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.PriceChangeIncludeCreateManyAndReturn<ExtArgs> | null;
};
/**
 * PriceChange update
 */
export type PriceChangeUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The data needed to update a PriceChange.
     */
    data: Prisma.XOR<Prisma.PriceChangeUpdateInput, Prisma.PriceChangeUncheckedUpdateInput>;
    /**
     * Choose, which PriceChange to update.
     */
    where: Prisma.PriceChangeWhereUniqueInput;
};
/**
 * PriceChange updateMany
 */
export type PriceChangeUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to update PriceChanges.
     */
    data: Prisma.XOR<Prisma.PriceChangeUpdateManyMutationInput, Prisma.PriceChangeUncheckedUpdateManyInput>;
    /**
     * Filter which PriceChanges to update
     */
    where?: Prisma.PriceChangeWhereInput;
    /**
     * Limit how many PriceChanges to update.
     */
    limit?: number;
};
/**
 * PriceChange updateManyAndReturn
 */
export type PriceChangeUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PriceChange
     */
    select?: Prisma.PriceChangeSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the PriceChange
     */
    omit?: Prisma.PriceChangeOmit<ExtArgs> | null;
    /**
     * The data used to update PriceChanges.
     */
    data: Prisma.XOR<Prisma.PriceChangeUpdateManyMutationInput, Prisma.PriceChangeUncheckedUpdateManyInput>;
    /**
     * Filter which PriceChanges to update
     */
    where?: Prisma.PriceChangeWhereInput;
    /**
     * Limit how many PriceChanges to update.
     */
    limit?: number;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.PriceChangeIncludeUpdateManyAndReturn<ExtArgs> | null;
};
/**
 * PriceChange upsert
 */
export type PriceChangeUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The filter to search for the PriceChange to update in case it exists.
     */
    where: Prisma.PriceChangeWhereUniqueInput;
    /**
     * In case the PriceChange found by the `where` argument doesn't exist, create a new PriceChange with this data.
     */
    create: Prisma.XOR<Prisma.PriceChangeCreateInput, Prisma.PriceChangeUncheckedCreateInput>;
    /**
     * In case the PriceChange was found with the provided `where` argument, update it with this data.
     */
    update: Prisma.XOR<Prisma.PriceChangeUpdateInput, Prisma.PriceChangeUncheckedUpdateInput>;
};
/**
 * PriceChange delete
 */
export type PriceChangeDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter which PriceChange to delete.
     */
    where: Prisma.PriceChangeWhereUniqueInput;
};
/**
 * PriceChange deleteMany
 */
export type PriceChangeDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which PriceChanges to delete
     */
    where?: Prisma.PriceChangeWhereInput;
    /**
     * Limit how many PriceChanges to delete.
     */
    limit?: number;
};
/**
 * PriceChange without action
 */
export type PriceChangeDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
};
export {};
//# sourceMappingURL=PriceChange.d.ts.map