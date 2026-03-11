import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace";
/**
 * Model CurrencyRate
 *
 */
export type CurrencyRateModel = runtime.Types.Result.DefaultSelection<Prisma.$CurrencyRatePayload>;
export type AggregateCurrencyRate = {
    _count: CurrencyRateCountAggregateOutputType | null;
    _avg: CurrencyRateAvgAggregateOutputType | null;
    _sum: CurrencyRateSumAggregateOutputType | null;
    _min: CurrencyRateMinAggregateOutputType | null;
    _max: CurrencyRateMaxAggregateOutputType | null;
};
export type CurrencyRateAvgAggregateOutputType = {
    id: number | null;
    rate: runtime.Decimal | null;
    previousRate: runtime.Decimal | null;
};
export type CurrencyRateSumAggregateOutputType = {
    id: number | null;
    rate: runtime.Decimal | null;
    previousRate: runtime.Decimal | null;
};
export type CurrencyRateMinAggregateOutputType = {
    id: number | null;
    currency: string | null;
    rate: runtime.Decimal | null;
    previousRate: runtime.Decimal | null;
    updatedAt: Date | null;
};
export type CurrencyRateMaxAggregateOutputType = {
    id: number | null;
    currency: string | null;
    rate: runtime.Decimal | null;
    previousRate: runtime.Decimal | null;
    updatedAt: Date | null;
};
export type CurrencyRateCountAggregateOutputType = {
    id: number;
    currency: number;
    rate: number;
    previousRate: number;
    updatedAt: number;
    _all: number;
};
export type CurrencyRateAvgAggregateInputType = {
    id?: true;
    rate?: true;
    previousRate?: true;
};
export type CurrencyRateSumAggregateInputType = {
    id?: true;
    rate?: true;
    previousRate?: true;
};
export type CurrencyRateMinAggregateInputType = {
    id?: true;
    currency?: true;
    rate?: true;
    previousRate?: true;
    updatedAt?: true;
};
export type CurrencyRateMaxAggregateInputType = {
    id?: true;
    currency?: true;
    rate?: true;
    previousRate?: true;
    updatedAt?: true;
};
export type CurrencyRateCountAggregateInputType = {
    id?: true;
    currency?: true;
    rate?: true;
    previousRate?: true;
    updatedAt?: true;
    _all?: true;
};
export type CurrencyRateAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which CurrencyRate to aggregate.
     */
    where?: Prisma.CurrencyRateWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of CurrencyRates to fetch.
     */
    orderBy?: Prisma.CurrencyRateOrderByWithRelationInput | Prisma.CurrencyRateOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: Prisma.CurrencyRateWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` CurrencyRates from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` CurrencyRates.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned CurrencyRates
    **/
    _count?: true | CurrencyRateCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to average
    **/
    _avg?: CurrencyRateAvgAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to sum
    **/
    _sum?: CurrencyRateSumAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
    **/
    _min?: CurrencyRateMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
    **/
    _max?: CurrencyRateMaxAggregateInputType;
};
export type GetCurrencyRateAggregateType<T extends CurrencyRateAggregateArgs> = {
    [P in keyof T & keyof AggregateCurrencyRate]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateCurrencyRate[P]> : Prisma.GetScalarType<T[P], AggregateCurrencyRate[P]>;
};
export type CurrencyRateGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.CurrencyRateWhereInput;
    orderBy?: Prisma.CurrencyRateOrderByWithAggregationInput | Prisma.CurrencyRateOrderByWithAggregationInput[];
    by: Prisma.CurrencyRateScalarFieldEnum[] | Prisma.CurrencyRateScalarFieldEnum;
    having?: Prisma.CurrencyRateScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: CurrencyRateCountAggregateInputType | true;
    _avg?: CurrencyRateAvgAggregateInputType;
    _sum?: CurrencyRateSumAggregateInputType;
    _min?: CurrencyRateMinAggregateInputType;
    _max?: CurrencyRateMaxAggregateInputType;
};
export type CurrencyRateGroupByOutputType = {
    id: number;
    currency: string;
    rate: runtime.Decimal;
    previousRate: runtime.Decimal | null;
    updatedAt: Date;
    _count: CurrencyRateCountAggregateOutputType | null;
    _avg: CurrencyRateAvgAggregateOutputType | null;
    _sum: CurrencyRateSumAggregateOutputType | null;
    _min: CurrencyRateMinAggregateOutputType | null;
    _max: CurrencyRateMaxAggregateOutputType | null;
};
type GetCurrencyRateGroupByPayload<T extends CurrencyRateGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<CurrencyRateGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof CurrencyRateGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], CurrencyRateGroupByOutputType[P]> : Prisma.GetScalarType<T[P], CurrencyRateGroupByOutputType[P]>;
}>>;
export type CurrencyRateWhereInput = {
    AND?: Prisma.CurrencyRateWhereInput | Prisma.CurrencyRateWhereInput[];
    OR?: Prisma.CurrencyRateWhereInput[];
    NOT?: Prisma.CurrencyRateWhereInput | Prisma.CurrencyRateWhereInput[];
    id?: Prisma.IntFilter<"CurrencyRate"> | number;
    currency?: Prisma.StringFilter<"CurrencyRate"> | string;
    rate?: Prisma.DecimalFilter<"CurrencyRate"> | runtime.Decimal | runtime.DecimalJsLike | number | string;
    previousRate?: Prisma.DecimalNullableFilter<"CurrencyRate"> | runtime.Decimal | runtime.DecimalJsLike | number | string | null;
    updatedAt?: Prisma.DateTimeFilter<"CurrencyRate"> | Date | string;
};
export type CurrencyRateOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    currency?: Prisma.SortOrder;
    rate?: Prisma.SortOrder;
    previousRate?: Prisma.SortOrderInput | Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type CurrencyRateWhereUniqueInput = Prisma.AtLeast<{
    id?: number;
    currency?: string;
    AND?: Prisma.CurrencyRateWhereInput | Prisma.CurrencyRateWhereInput[];
    OR?: Prisma.CurrencyRateWhereInput[];
    NOT?: Prisma.CurrencyRateWhereInput | Prisma.CurrencyRateWhereInput[];
    rate?: Prisma.DecimalFilter<"CurrencyRate"> | runtime.Decimal | runtime.DecimalJsLike | number | string;
    previousRate?: Prisma.DecimalNullableFilter<"CurrencyRate"> | runtime.Decimal | runtime.DecimalJsLike | number | string | null;
    updatedAt?: Prisma.DateTimeFilter<"CurrencyRate"> | Date | string;
}, "id" | "currency">;
export type CurrencyRateOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    currency?: Prisma.SortOrder;
    rate?: Prisma.SortOrder;
    previousRate?: Prisma.SortOrderInput | Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    _count?: Prisma.CurrencyRateCountOrderByAggregateInput;
    _avg?: Prisma.CurrencyRateAvgOrderByAggregateInput;
    _max?: Prisma.CurrencyRateMaxOrderByAggregateInput;
    _min?: Prisma.CurrencyRateMinOrderByAggregateInput;
    _sum?: Prisma.CurrencyRateSumOrderByAggregateInput;
};
export type CurrencyRateScalarWhereWithAggregatesInput = {
    AND?: Prisma.CurrencyRateScalarWhereWithAggregatesInput | Prisma.CurrencyRateScalarWhereWithAggregatesInput[];
    OR?: Prisma.CurrencyRateScalarWhereWithAggregatesInput[];
    NOT?: Prisma.CurrencyRateScalarWhereWithAggregatesInput | Prisma.CurrencyRateScalarWhereWithAggregatesInput[];
    id?: Prisma.IntWithAggregatesFilter<"CurrencyRate"> | number;
    currency?: Prisma.StringWithAggregatesFilter<"CurrencyRate"> | string;
    rate?: Prisma.DecimalWithAggregatesFilter<"CurrencyRate"> | runtime.Decimal | runtime.DecimalJsLike | number | string;
    previousRate?: Prisma.DecimalNullableWithAggregatesFilter<"CurrencyRate"> | runtime.Decimal | runtime.DecimalJsLike | number | string | null;
    updatedAt?: Prisma.DateTimeWithAggregatesFilter<"CurrencyRate"> | Date | string;
};
export type CurrencyRateCreateInput = {
    currency: string;
    rate: runtime.Decimal | runtime.DecimalJsLike | number | string;
    previousRate?: runtime.Decimal | runtime.DecimalJsLike | number | string | null;
    updatedAt?: Date | string;
};
export type CurrencyRateUncheckedCreateInput = {
    id?: number;
    currency: string;
    rate: runtime.Decimal | runtime.DecimalJsLike | number | string;
    previousRate?: runtime.Decimal | runtime.DecimalJsLike | number | string | null;
    updatedAt?: Date | string;
};
export type CurrencyRateUpdateInput = {
    currency?: Prisma.StringFieldUpdateOperationsInput | string;
    rate?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    previousRate?: Prisma.NullableDecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string | null;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type CurrencyRateUncheckedUpdateInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    currency?: Prisma.StringFieldUpdateOperationsInput | string;
    rate?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    previousRate?: Prisma.NullableDecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string | null;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type CurrencyRateCreateManyInput = {
    id?: number;
    currency: string;
    rate: runtime.Decimal | runtime.DecimalJsLike | number | string;
    previousRate?: runtime.Decimal | runtime.DecimalJsLike | number | string | null;
    updatedAt?: Date | string;
};
export type CurrencyRateUpdateManyMutationInput = {
    currency?: Prisma.StringFieldUpdateOperationsInput | string;
    rate?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    previousRate?: Prisma.NullableDecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string | null;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type CurrencyRateUncheckedUpdateManyInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    currency?: Prisma.StringFieldUpdateOperationsInput | string;
    rate?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    previousRate?: Prisma.NullableDecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string | null;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type CurrencyRateCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    currency?: Prisma.SortOrder;
    rate?: Prisma.SortOrder;
    previousRate?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type CurrencyRateAvgOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    rate?: Prisma.SortOrder;
    previousRate?: Prisma.SortOrder;
};
export type CurrencyRateMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    currency?: Prisma.SortOrder;
    rate?: Prisma.SortOrder;
    previousRate?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type CurrencyRateMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    currency?: Prisma.SortOrder;
    rate?: Prisma.SortOrder;
    previousRate?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type CurrencyRateSumOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    rate?: Prisma.SortOrder;
    previousRate?: Prisma.SortOrder;
};
export type CurrencyRateSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    currency?: boolean;
    rate?: boolean;
    previousRate?: boolean;
    updatedAt?: boolean;
}, ExtArgs["result"]["currencyRate"]>;
export type CurrencyRateSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    currency?: boolean;
    rate?: boolean;
    previousRate?: boolean;
    updatedAt?: boolean;
}, ExtArgs["result"]["currencyRate"]>;
export type CurrencyRateSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    currency?: boolean;
    rate?: boolean;
    previousRate?: boolean;
    updatedAt?: boolean;
}, ExtArgs["result"]["currencyRate"]>;
export type CurrencyRateSelectScalar = {
    id?: boolean;
    currency?: boolean;
    rate?: boolean;
    previousRate?: boolean;
    updatedAt?: boolean;
};
export type CurrencyRateOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "currency" | "rate" | "previousRate" | "updatedAt", ExtArgs["result"]["currencyRate"]>;
export type $CurrencyRatePayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "CurrencyRate";
    objects: {};
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: number;
        currency: string;
        rate: runtime.Decimal;
        previousRate: runtime.Decimal | null;
        updatedAt: Date;
    }, ExtArgs["result"]["currencyRate"]>;
    composites: {};
};
export type CurrencyRateGetPayload<S extends boolean | null | undefined | CurrencyRateDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$CurrencyRatePayload, S>;
export type CurrencyRateCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<CurrencyRateFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: CurrencyRateCountAggregateInputType | true;
};
export interface CurrencyRateDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['CurrencyRate'];
        meta: {
            name: 'CurrencyRate';
        };
    };
    /**
     * Find zero or one CurrencyRate that matches the filter.
     * @param {CurrencyRateFindUniqueArgs} args - Arguments to find a CurrencyRate
     * @example
     * // Get one CurrencyRate
     * const currencyRate = await prisma.currencyRate.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends CurrencyRateFindUniqueArgs>(args: Prisma.SelectSubset<T, CurrencyRateFindUniqueArgs<ExtArgs>>): Prisma.Prisma__CurrencyRateClient<runtime.Types.Result.GetResult<Prisma.$CurrencyRatePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find one CurrencyRate that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {CurrencyRateFindUniqueOrThrowArgs} args - Arguments to find a CurrencyRate
     * @example
     * // Get one CurrencyRate
     * const currencyRate = await prisma.currencyRate.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends CurrencyRateFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, CurrencyRateFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__CurrencyRateClient<runtime.Types.Result.GetResult<Prisma.$CurrencyRatePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first CurrencyRate that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CurrencyRateFindFirstArgs} args - Arguments to find a CurrencyRate
     * @example
     * // Get one CurrencyRate
     * const currencyRate = await prisma.currencyRate.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends CurrencyRateFindFirstArgs>(args?: Prisma.SelectSubset<T, CurrencyRateFindFirstArgs<ExtArgs>>): Prisma.Prisma__CurrencyRateClient<runtime.Types.Result.GetResult<Prisma.$CurrencyRatePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first CurrencyRate that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CurrencyRateFindFirstOrThrowArgs} args - Arguments to find a CurrencyRate
     * @example
     * // Get one CurrencyRate
     * const currencyRate = await prisma.currencyRate.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends CurrencyRateFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, CurrencyRateFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__CurrencyRateClient<runtime.Types.Result.GetResult<Prisma.$CurrencyRatePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find zero or more CurrencyRates that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CurrencyRateFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all CurrencyRates
     * const currencyRates = await prisma.currencyRate.findMany()
     *
     * // Get first 10 CurrencyRates
     * const currencyRates = await prisma.currencyRate.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const currencyRateWithIdOnly = await prisma.currencyRate.findMany({ select: { id: true } })
     *
     */
    findMany<T extends CurrencyRateFindManyArgs>(args?: Prisma.SelectSubset<T, CurrencyRateFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$CurrencyRatePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    /**
     * Create a CurrencyRate.
     * @param {CurrencyRateCreateArgs} args - Arguments to create a CurrencyRate.
     * @example
     * // Create one CurrencyRate
     * const CurrencyRate = await prisma.currencyRate.create({
     *   data: {
     *     // ... data to create a CurrencyRate
     *   }
     * })
     *
     */
    create<T extends CurrencyRateCreateArgs>(args: Prisma.SelectSubset<T, CurrencyRateCreateArgs<ExtArgs>>): Prisma.Prisma__CurrencyRateClient<runtime.Types.Result.GetResult<Prisma.$CurrencyRatePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Create many CurrencyRates.
     * @param {CurrencyRateCreateManyArgs} args - Arguments to create many CurrencyRates.
     * @example
     * // Create many CurrencyRates
     * const currencyRate = await prisma.currencyRate.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends CurrencyRateCreateManyArgs>(args?: Prisma.SelectSubset<T, CurrencyRateCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Create many CurrencyRates and returns the data saved in the database.
     * @param {CurrencyRateCreateManyAndReturnArgs} args - Arguments to create many CurrencyRates.
     * @example
     * // Create many CurrencyRates
     * const currencyRate = await prisma.currencyRate.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many CurrencyRates and only return the `id`
     * const currencyRateWithIdOnly = await prisma.currencyRate.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends CurrencyRateCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, CurrencyRateCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$CurrencyRatePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    /**
     * Delete a CurrencyRate.
     * @param {CurrencyRateDeleteArgs} args - Arguments to delete one CurrencyRate.
     * @example
     * // Delete one CurrencyRate
     * const CurrencyRate = await prisma.currencyRate.delete({
     *   where: {
     *     // ... filter to delete one CurrencyRate
     *   }
     * })
     *
     */
    delete<T extends CurrencyRateDeleteArgs>(args: Prisma.SelectSubset<T, CurrencyRateDeleteArgs<ExtArgs>>): Prisma.Prisma__CurrencyRateClient<runtime.Types.Result.GetResult<Prisma.$CurrencyRatePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Update one CurrencyRate.
     * @param {CurrencyRateUpdateArgs} args - Arguments to update one CurrencyRate.
     * @example
     * // Update one CurrencyRate
     * const currencyRate = await prisma.currencyRate.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends CurrencyRateUpdateArgs>(args: Prisma.SelectSubset<T, CurrencyRateUpdateArgs<ExtArgs>>): Prisma.Prisma__CurrencyRateClient<runtime.Types.Result.GetResult<Prisma.$CurrencyRatePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Delete zero or more CurrencyRates.
     * @param {CurrencyRateDeleteManyArgs} args - Arguments to filter CurrencyRates to delete.
     * @example
     * // Delete a few CurrencyRates
     * const { count } = await prisma.currencyRate.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends CurrencyRateDeleteManyArgs>(args?: Prisma.SelectSubset<T, CurrencyRateDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more CurrencyRates.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CurrencyRateUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many CurrencyRates
     * const currencyRate = await prisma.currencyRate.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends CurrencyRateUpdateManyArgs>(args: Prisma.SelectSubset<T, CurrencyRateUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more CurrencyRates and returns the data updated in the database.
     * @param {CurrencyRateUpdateManyAndReturnArgs} args - Arguments to update many CurrencyRates.
     * @example
     * // Update many CurrencyRates
     * const currencyRate = await prisma.currencyRate.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more CurrencyRates and only return the `id`
     * const currencyRateWithIdOnly = await prisma.currencyRate.updateManyAndReturn({
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
    updateManyAndReturn<T extends CurrencyRateUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, CurrencyRateUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$CurrencyRatePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    /**
     * Create or update one CurrencyRate.
     * @param {CurrencyRateUpsertArgs} args - Arguments to update or create a CurrencyRate.
     * @example
     * // Update or create a CurrencyRate
     * const currencyRate = await prisma.currencyRate.upsert({
     *   create: {
     *     // ... data to create a CurrencyRate
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the CurrencyRate we want to update
     *   }
     * })
     */
    upsert<T extends CurrencyRateUpsertArgs>(args: Prisma.SelectSubset<T, CurrencyRateUpsertArgs<ExtArgs>>): Prisma.Prisma__CurrencyRateClient<runtime.Types.Result.GetResult<Prisma.$CurrencyRatePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Count the number of CurrencyRates.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CurrencyRateCountArgs} args - Arguments to filter CurrencyRates to count.
     * @example
     * // Count the number of CurrencyRates
     * const count = await prisma.currencyRate.count({
     *   where: {
     *     // ... the filter for the CurrencyRates we want to count
     *   }
     * })
    **/
    count<T extends CurrencyRateCountArgs>(args?: Prisma.Subset<T, CurrencyRateCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], CurrencyRateCountAggregateOutputType> : number>;
    /**
     * Allows you to perform aggregations operations on a CurrencyRate.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CurrencyRateAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends CurrencyRateAggregateArgs>(args: Prisma.Subset<T, CurrencyRateAggregateArgs>): Prisma.PrismaPromise<GetCurrencyRateAggregateType<T>>;
    /**
     * Group by CurrencyRate.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CurrencyRateGroupByArgs} args - Group by arguments.
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
    groupBy<T extends CurrencyRateGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: CurrencyRateGroupByArgs['orderBy'];
    } : {
        orderBy?: CurrencyRateGroupByArgs['orderBy'];
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
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, CurrencyRateGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetCurrencyRateGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the CurrencyRate model
     */
    readonly fields: CurrencyRateFieldRefs;
}
/**
 * The delegate class that acts as a "Promise-like" for CurrencyRate.
 * Why is this prefixed with `Prisma__`?
 * Because we want to prevent naming conflicts as mentioned in
 * https://github.com/prisma/prisma-client-js/issues/707
 */
export interface Prisma__CurrencyRateClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
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
 * Fields of the CurrencyRate model
 */
export interface CurrencyRateFieldRefs {
    readonly id: Prisma.FieldRef<"CurrencyRate", 'Int'>;
    readonly currency: Prisma.FieldRef<"CurrencyRate", 'String'>;
    readonly rate: Prisma.FieldRef<"CurrencyRate", 'Decimal'>;
    readonly previousRate: Prisma.FieldRef<"CurrencyRate", 'Decimal'>;
    readonly updatedAt: Prisma.FieldRef<"CurrencyRate", 'DateTime'>;
}
/**
 * CurrencyRate findUnique
 */
export type CurrencyRateFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CurrencyRate
     */
    select?: Prisma.CurrencyRateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the CurrencyRate
     */
    omit?: Prisma.CurrencyRateOmit<ExtArgs> | null;
    /**
     * Filter, which CurrencyRate to fetch.
     */
    where: Prisma.CurrencyRateWhereUniqueInput;
};
/**
 * CurrencyRate findUniqueOrThrow
 */
export type CurrencyRateFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CurrencyRate
     */
    select?: Prisma.CurrencyRateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the CurrencyRate
     */
    omit?: Prisma.CurrencyRateOmit<ExtArgs> | null;
    /**
     * Filter, which CurrencyRate to fetch.
     */
    where: Prisma.CurrencyRateWhereUniqueInput;
};
/**
 * CurrencyRate findFirst
 */
export type CurrencyRateFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CurrencyRate
     */
    select?: Prisma.CurrencyRateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the CurrencyRate
     */
    omit?: Prisma.CurrencyRateOmit<ExtArgs> | null;
    /**
     * Filter, which CurrencyRate to fetch.
     */
    where?: Prisma.CurrencyRateWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of CurrencyRates to fetch.
     */
    orderBy?: Prisma.CurrencyRateOrderByWithRelationInput | Prisma.CurrencyRateOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for CurrencyRates.
     */
    cursor?: Prisma.CurrencyRateWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` CurrencyRates from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` CurrencyRates.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of CurrencyRates.
     */
    distinct?: Prisma.CurrencyRateScalarFieldEnum | Prisma.CurrencyRateScalarFieldEnum[];
};
/**
 * CurrencyRate findFirstOrThrow
 */
export type CurrencyRateFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CurrencyRate
     */
    select?: Prisma.CurrencyRateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the CurrencyRate
     */
    omit?: Prisma.CurrencyRateOmit<ExtArgs> | null;
    /**
     * Filter, which CurrencyRate to fetch.
     */
    where?: Prisma.CurrencyRateWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of CurrencyRates to fetch.
     */
    orderBy?: Prisma.CurrencyRateOrderByWithRelationInput | Prisma.CurrencyRateOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for CurrencyRates.
     */
    cursor?: Prisma.CurrencyRateWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` CurrencyRates from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` CurrencyRates.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of CurrencyRates.
     */
    distinct?: Prisma.CurrencyRateScalarFieldEnum | Prisma.CurrencyRateScalarFieldEnum[];
};
/**
 * CurrencyRate findMany
 */
export type CurrencyRateFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CurrencyRate
     */
    select?: Prisma.CurrencyRateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the CurrencyRate
     */
    omit?: Prisma.CurrencyRateOmit<ExtArgs> | null;
    /**
     * Filter, which CurrencyRates to fetch.
     */
    where?: Prisma.CurrencyRateWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of CurrencyRates to fetch.
     */
    orderBy?: Prisma.CurrencyRateOrderByWithRelationInput | Prisma.CurrencyRateOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing CurrencyRates.
     */
    cursor?: Prisma.CurrencyRateWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` CurrencyRates from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` CurrencyRates.
     */
    skip?: number;
    distinct?: Prisma.CurrencyRateScalarFieldEnum | Prisma.CurrencyRateScalarFieldEnum[];
};
/**
 * CurrencyRate create
 */
export type CurrencyRateCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CurrencyRate
     */
    select?: Prisma.CurrencyRateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the CurrencyRate
     */
    omit?: Prisma.CurrencyRateOmit<ExtArgs> | null;
    /**
     * The data needed to create a CurrencyRate.
     */
    data: Prisma.XOR<Prisma.CurrencyRateCreateInput, Prisma.CurrencyRateUncheckedCreateInput>;
};
/**
 * CurrencyRate createMany
 */
export type CurrencyRateCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to create many CurrencyRates.
     */
    data: Prisma.CurrencyRateCreateManyInput | Prisma.CurrencyRateCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * CurrencyRate createManyAndReturn
 */
export type CurrencyRateCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CurrencyRate
     */
    select?: Prisma.CurrencyRateSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the CurrencyRate
     */
    omit?: Prisma.CurrencyRateOmit<ExtArgs> | null;
    /**
     * The data used to create many CurrencyRates.
     */
    data: Prisma.CurrencyRateCreateManyInput | Prisma.CurrencyRateCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * CurrencyRate update
 */
export type CurrencyRateUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CurrencyRate
     */
    select?: Prisma.CurrencyRateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the CurrencyRate
     */
    omit?: Prisma.CurrencyRateOmit<ExtArgs> | null;
    /**
     * The data needed to update a CurrencyRate.
     */
    data: Prisma.XOR<Prisma.CurrencyRateUpdateInput, Prisma.CurrencyRateUncheckedUpdateInput>;
    /**
     * Choose, which CurrencyRate to update.
     */
    where: Prisma.CurrencyRateWhereUniqueInput;
};
/**
 * CurrencyRate updateMany
 */
export type CurrencyRateUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to update CurrencyRates.
     */
    data: Prisma.XOR<Prisma.CurrencyRateUpdateManyMutationInput, Prisma.CurrencyRateUncheckedUpdateManyInput>;
    /**
     * Filter which CurrencyRates to update
     */
    where?: Prisma.CurrencyRateWhereInput;
    /**
     * Limit how many CurrencyRates to update.
     */
    limit?: number;
};
/**
 * CurrencyRate updateManyAndReturn
 */
export type CurrencyRateUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CurrencyRate
     */
    select?: Prisma.CurrencyRateSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the CurrencyRate
     */
    omit?: Prisma.CurrencyRateOmit<ExtArgs> | null;
    /**
     * The data used to update CurrencyRates.
     */
    data: Prisma.XOR<Prisma.CurrencyRateUpdateManyMutationInput, Prisma.CurrencyRateUncheckedUpdateManyInput>;
    /**
     * Filter which CurrencyRates to update
     */
    where?: Prisma.CurrencyRateWhereInput;
    /**
     * Limit how many CurrencyRates to update.
     */
    limit?: number;
};
/**
 * CurrencyRate upsert
 */
export type CurrencyRateUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CurrencyRate
     */
    select?: Prisma.CurrencyRateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the CurrencyRate
     */
    omit?: Prisma.CurrencyRateOmit<ExtArgs> | null;
    /**
     * The filter to search for the CurrencyRate to update in case it exists.
     */
    where: Prisma.CurrencyRateWhereUniqueInput;
    /**
     * In case the CurrencyRate found by the `where` argument doesn't exist, create a new CurrencyRate with this data.
     */
    create: Prisma.XOR<Prisma.CurrencyRateCreateInput, Prisma.CurrencyRateUncheckedCreateInput>;
    /**
     * In case the CurrencyRate was found with the provided `where` argument, update it with this data.
     */
    update: Prisma.XOR<Prisma.CurrencyRateUpdateInput, Prisma.CurrencyRateUncheckedUpdateInput>;
};
/**
 * CurrencyRate delete
 */
export type CurrencyRateDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CurrencyRate
     */
    select?: Prisma.CurrencyRateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the CurrencyRate
     */
    omit?: Prisma.CurrencyRateOmit<ExtArgs> | null;
    /**
     * Filter which CurrencyRate to delete.
     */
    where: Prisma.CurrencyRateWhereUniqueInput;
};
/**
 * CurrencyRate deleteMany
 */
export type CurrencyRateDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which CurrencyRates to delete
     */
    where?: Prisma.CurrencyRateWhereInput;
    /**
     * Limit how many CurrencyRates to delete.
     */
    limit?: number;
};
/**
 * CurrencyRate without action
 */
export type CurrencyRateDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CurrencyRate
     */
    select?: Prisma.CurrencyRateSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the CurrencyRate
     */
    omit?: Prisma.CurrencyRateOmit<ExtArgs> | null;
};
export {};
//# sourceMappingURL=CurrencyRate.d.ts.map