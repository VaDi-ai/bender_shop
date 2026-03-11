import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace";
/**
 * Model HeroBanner
 *
 */
export type HeroBannerModel = runtime.Types.Result.DefaultSelection<Prisma.$HeroBannerPayload>;
export type AggregateHeroBanner = {
    _count: HeroBannerCountAggregateOutputType | null;
    _avg: HeroBannerAvgAggregateOutputType | null;
    _sum: HeroBannerSumAggregateOutputType | null;
    _min: HeroBannerMinAggregateOutputType | null;
    _max: HeroBannerMaxAggregateOutputType | null;
};
export type HeroBannerAvgAggregateOutputType = {
    id: number | null;
    order: number | null;
};
export type HeroBannerSumAggregateOutputType = {
    id: number | null;
    order: number | null;
};
export type HeroBannerMinAggregateOutputType = {
    id: number | null;
    imageFile: string | null;
    title: string | null;
    subtitle: string | null;
    order: number | null;
    isActive: boolean | null;
    createdAt: Date | null;
};
export type HeroBannerMaxAggregateOutputType = {
    id: number | null;
    imageFile: string | null;
    title: string | null;
    subtitle: string | null;
    order: number | null;
    isActive: boolean | null;
    createdAt: Date | null;
};
export type HeroBannerCountAggregateOutputType = {
    id: number;
    imageFile: number;
    title: number;
    subtitle: number;
    order: number;
    isActive: number;
    createdAt: number;
    _all: number;
};
export type HeroBannerAvgAggregateInputType = {
    id?: true;
    order?: true;
};
export type HeroBannerSumAggregateInputType = {
    id?: true;
    order?: true;
};
export type HeroBannerMinAggregateInputType = {
    id?: true;
    imageFile?: true;
    title?: true;
    subtitle?: true;
    order?: true;
    isActive?: true;
    createdAt?: true;
};
export type HeroBannerMaxAggregateInputType = {
    id?: true;
    imageFile?: true;
    title?: true;
    subtitle?: true;
    order?: true;
    isActive?: true;
    createdAt?: true;
};
export type HeroBannerCountAggregateInputType = {
    id?: true;
    imageFile?: true;
    title?: true;
    subtitle?: true;
    order?: true;
    isActive?: true;
    createdAt?: true;
    _all?: true;
};
export type HeroBannerAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which HeroBanner to aggregate.
     */
    where?: Prisma.HeroBannerWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of HeroBanners to fetch.
     */
    orderBy?: Prisma.HeroBannerOrderByWithRelationInput | Prisma.HeroBannerOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: Prisma.HeroBannerWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` HeroBanners from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` HeroBanners.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned HeroBanners
    **/
    _count?: true | HeroBannerCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to average
    **/
    _avg?: HeroBannerAvgAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to sum
    **/
    _sum?: HeroBannerSumAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
    **/
    _min?: HeroBannerMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
    **/
    _max?: HeroBannerMaxAggregateInputType;
};
export type GetHeroBannerAggregateType<T extends HeroBannerAggregateArgs> = {
    [P in keyof T & keyof AggregateHeroBanner]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateHeroBanner[P]> : Prisma.GetScalarType<T[P], AggregateHeroBanner[P]>;
};
export type HeroBannerGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.HeroBannerWhereInput;
    orderBy?: Prisma.HeroBannerOrderByWithAggregationInput | Prisma.HeroBannerOrderByWithAggregationInput[];
    by: Prisma.HeroBannerScalarFieldEnum[] | Prisma.HeroBannerScalarFieldEnum;
    having?: Prisma.HeroBannerScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: HeroBannerCountAggregateInputType | true;
    _avg?: HeroBannerAvgAggregateInputType;
    _sum?: HeroBannerSumAggregateInputType;
    _min?: HeroBannerMinAggregateInputType;
    _max?: HeroBannerMaxAggregateInputType;
};
export type HeroBannerGroupByOutputType = {
    id: number;
    imageFile: string;
    title: string | null;
    subtitle: string | null;
    order: number;
    isActive: boolean;
    createdAt: Date;
    _count: HeroBannerCountAggregateOutputType | null;
    _avg: HeroBannerAvgAggregateOutputType | null;
    _sum: HeroBannerSumAggregateOutputType | null;
    _min: HeroBannerMinAggregateOutputType | null;
    _max: HeroBannerMaxAggregateOutputType | null;
};
type GetHeroBannerGroupByPayload<T extends HeroBannerGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<HeroBannerGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof HeroBannerGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], HeroBannerGroupByOutputType[P]> : Prisma.GetScalarType<T[P], HeroBannerGroupByOutputType[P]>;
}>>;
export type HeroBannerWhereInput = {
    AND?: Prisma.HeroBannerWhereInput | Prisma.HeroBannerWhereInput[];
    OR?: Prisma.HeroBannerWhereInput[];
    NOT?: Prisma.HeroBannerWhereInput | Prisma.HeroBannerWhereInput[];
    id?: Prisma.IntFilter<"HeroBanner"> | number;
    imageFile?: Prisma.StringFilter<"HeroBanner"> | string;
    title?: Prisma.StringNullableFilter<"HeroBanner"> | string | null;
    subtitle?: Prisma.StringNullableFilter<"HeroBanner"> | string | null;
    order?: Prisma.IntFilter<"HeroBanner"> | number;
    isActive?: Prisma.BoolFilter<"HeroBanner"> | boolean;
    createdAt?: Prisma.DateTimeFilter<"HeroBanner"> | Date | string;
};
export type HeroBannerOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    imageFile?: Prisma.SortOrder;
    title?: Prisma.SortOrderInput | Prisma.SortOrder;
    subtitle?: Prisma.SortOrderInput | Prisma.SortOrder;
    order?: Prisma.SortOrder;
    isActive?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
};
export type HeroBannerWhereUniqueInput = Prisma.AtLeast<{
    id?: number;
    AND?: Prisma.HeroBannerWhereInput | Prisma.HeroBannerWhereInput[];
    OR?: Prisma.HeroBannerWhereInput[];
    NOT?: Prisma.HeroBannerWhereInput | Prisma.HeroBannerWhereInput[];
    imageFile?: Prisma.StringFilter<"HeroBanner"> | string;
    title?: Prisma.StringNullableFilter<"HeroBanner"> | string | null;
    subtitle?: Prisma.StringNullableFilter<"HeroBanner"> | string | null;
    order?: Prisma.IntFilter<"HeroBanner"> | number;
    isActive?: Prisma.BoolFilter<"HeroBanner"> | boolean;
    createdAt?: Prisma.DateTimeFilter<"HeroBanner"> | Date | string;
}, "id">;
export type HeroBannerOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    imageFile?: Prisma.SortOrder;
    title?: Prisma.SortOrderInput | Prisma.SortOrder;
    subtitle?: Prisma.SortOrderInput | Prisma.SortOrder;
    order?: Prisma.SortOrder;
    isActive?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    _count?: Prisma.HeroBannerCountOrderByAggregateInput;
    _avg?: Prisma.HeroBannerAvgOrderByAggregateInput;
    _max?: Prisma.HeroBannerMaxOrderByAggregateInput;
    _min?: Prisma.HeroBannerMinOrderByAggregateInput;
    _sum?: Prisma.HeroBannerSumOrderByAggregateInput;
};
export type HeroBannerScalarWhereWithAggregatesInput = {
    AND?: Prisma.HeroBannerScalarWhereWithAggregatesInput | Prisma.HeroBannerScalarWhereWithAggregatesInput[];
    OR?: Prisma.HeroBannerScalarWhereWithAggregatesInput[];
    NOT?: Prisma.HeroBannerScalarWhereWithAggregatesInput | Prisma.HeroBannerScalarWhereWithAggregatesInput[];
    id?: Prisma.IntWithAggregatesFilter<"HeroBanner"> | number;
    imageFile?: Prisma.StringWithAggregatesFilter<"HeroBanner"> | string;
    title?: Prisma.StringNullableWithAggregatesFilter<"HeroBanner"> | string | null;
    subtitle?: Prisma.StringNullableWithAggregatesFilter<"HeroBanner"> | string | null;
    order?: Prisma.IntWithAggregatesFilter<"HeroBanner"> | number;
    isActive?: Prisma.BoolWithAggregatesFilter<"HeroBanner"> | boolean;
    createdAt?: Prisma.DateTimeWithAggregatesFilter<"HeroBanner"> | Date | string;
};
export type HeroBannerCreateInput = {
    imageFile: string;
    title?: string | null;
    subtitle?: string | null;
    order?: number;
    isActive?: boolean;
    createdAt?: Date | string;
};
export type HeroBannerUncheckedCreateInput = {
    id?: number;
    imageFile: string;
    title?: string | null;
    subtitle?: string | null;
    order?: number;
    isActive?: boolean;
    createdAt?: Date | string;
};
export type HeroBannerUpdateInput = {
    imageFile?: Prisma.StringFieldUpdateOperationsInput | string;
    title?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    subtitle?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    order?: Prisma.IntFieldUpdateOperationsInput | number;
    isActive?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type HeroBannerUncheckedUpdateInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    imageFile?: Prisma.StringFieldUpdateOperationsInput | string;
    title?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    subtitle?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    order?: Prisma.IntFieldUpdateOperationsInput | number;
    isActive?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type HeroBannerCreateManyInput = {
    id?: number;
    imageFile: string;
    title?: string | null;
    subtitle?: string | null;
    order?: number;
    isActive?: boolean;
    createdAt?: Date | string;
};
export type HeroBannerUpdateManyMutationInput = {
    imageFile?: Prisma.StringFieldUpdateOperationsInput | string;
    title?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    subtitle?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    order?: Prisma.IntFieldUpdateOperationsInput | number;
    isActive?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type HeroBannerUncheckedUpdateManyInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    imageFile?: Prisma.StringFieldUpdateOperationsInput | string;
    title?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    subtitle?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    order?: Prisma.IntFieldUpdateOperationsInput | number;
    isActive?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type HeroBannerCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    imageFile?: Prisma.SortOrder;
    title?: Prisma.SortOrder;
    subtitle?: Prisma.SortOrder;
    order?: Prisma.SortOrder;
    isActive?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
};
export type HeroBannerAvgOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    order?: Prisma.SortOrder;
};
export type HeroBannerMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    imageFile?: Prisma.SortOrder;
    title?: Prisma.SortOrder;
    subtitle?: Prisma.SortOrder;
    order?: Prisma.SortOrder;
    isActive?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
};
export type HeroBannerMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    imageFile?: Prisma.SortOrder;
    title?: Prisma.SortOrder;
    subtitle?: Prisma.SortOrder;
    order?: Prisma.SortOrder;
    isActive?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
};
export type HeroBannerSumOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    order?: Prisma.SortOrder;
};
export type HeroBannerSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    imageFile?: boolean;
    title?: boolean;
    subtitle?: boolean;
    order?: boolean;
    isActive?: boolean;
    createdAt?: boolean;
}, ExtArgs["result"]["heroBanner"]>;
export type HeroBannerSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    imageFile?: boolean;
    title?: boolean;
    subtitle?: boolean;
    order?: boolean;
    isActive?: boolean;
    createdAt?: boolean;
}, ExtArgs["result"]["heroBanner"]>;
export type HeroBannerSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    imageFile?: boolean;
    title?: boolean;
    subtitle?: boolean;
    order?: boolean;
    isActive?: boolean;
    createdAt?: boolean;
}, ExtArgs["result"]["heroBanner"]>;
export type HeroBannerSelectScalar = {
    id?: boolean;
    imageFile?: boolean;
    title?: boolean;
    subtitle?: boolean;
    order?: boolean;
    isActive?: boolean;
    createdAt?: boolean;
};
export type HeroBannerOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "imageFile" | "title" | "subtitle" | "order" | "isActive" | "createdAt", ExtArgs["result"]["heroBanner"]>;
export type $HeroBannerPayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "HeroBanner";
    objects: {};
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: number;
        imageFile: string;
        title: string | null;
        subtitle: string | null;
        order: number;
        isActive: boolean;
        createdAt: Date;
    }, ExtArgs["result"]["heroBanner"]>;
    composites: {};
};
export type HeroBannerGetPayload<S extends boolean | null | undefined | HeroBannerDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$HeroBannerPayload, S>;
export type HeroBannerCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<HeroBannerFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: HeroBannerCountAggregateInputType | true;
};
export interface HeroBannerDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['HeroBanner'];
        meta: {
            name: 'HeroBanner';
        };
    };
    /**
     * Find zero or one HeroBanner that matches the filter.
     * @param {HeroBannerFindUniqueArgs} args - Arguments to find a HeroBanner
     * @example
     * // Get one HeroBanner
     * const heroBanner = await prisma.heroBanner.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends HeroBannerFindUniqueArgs>(args: Prisma.SelectSubset<T, HeroBannerFindUniqueArgs<ExtArgs>>): Prisma.Prisma__HeroBannerClient<runtime.Types.Result.GetResult<Prisma.$HeroBannerPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find one HeroBanner that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {HeroBannerFindUniqueOrThrowArgs} args - Arguments to find a HeroBanner
     * @example
     * // Get one HeroBanner
     * const heroBanner = await prisma.heroBanner.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends HeroBannerFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, HeroBannerFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__HeroBannerClient<runtime.Types.Result.GetResult<Prisma.$HeroBannerPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first HeroBanner that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {HeroBannerFindFirstArgs} args - Arguments to find a HeroBanner
     * @example
     * // Get one HeroBanner
     * const heroBanner = await prisma.heroBanner.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends HeroBannerFindFirstArgs>(args?: Prisma.SelectSubset<T, HeroBannerFindFirstArgs<ExtArgs>>): Prisma.Prisma__HeroBannerClient<runtime.Types.Result.GetResult<Prisma.$HeroBannerPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first HeroBanner that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {HeroBannerFindFirstOrThrowArgs} args - Arguments to find a HeroBanner
     * @example
     * // Get one HeroBanner
     * const heroBanner = await prisma.heroBanner.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends HeroBannerFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, HeroBannerFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__HeroBannerClient<runtime.Types.Result.GetResult<Prisma.$HeroBannerPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find zero or more HeroBanners that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {HeroBannerFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all HeroBanners
     * const heroBanners = await prisma.heroBanner.findMany()
     *
     * // Get first 10 HeroBanners
     * const heroBanners = await prisma.heroBanner.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const heroBannerWithIdOnly = await prisma.heroBanner.findMany({ select: { id: true } })
     *
     */
    findMany<T extends HeroBannerFindManyArgs>(args?: Prisma.SelectSubset<T, HeroBannerFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$HeroBannerPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    /**
     * Create a HeroBanner.
     * @param {HeroBannerCreateArgs} args - Arguments to create a HeroBanner.
     * @example
     * // Create one HeroBanner
     * const HeroBanner = await prisma.heroBanner.create({
     *   data: {
     *     // ... data to create a HeroBanner
     *   }
     * })
     *
     */
    create<T extends HeroBannerCreateArgs>(args: Prisma.SelectSubset<T, HeroBannerCreateArgs<ExtArgs>>): Prisma.Prisma__HeroBannerClient<runtime.Types.Result.GetResult<Prisma.$HeroBannerPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Create many HeroBanners.
     * @param {HeroBannerCreateManyArgs} args - Arguments to create many HeroBanners.
     * @example
     * // Create many HeroBanners
     * const heroBanner = await prisma.heroBanner.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends HeroBannerCreateManyArgs>(args?: Prisma.SelectSubset<T, HeroBannerCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Create many HeroBanners and returns the data saved in the database.
     * @param {HeroBannerCreateManyAndReturnArgs} args - Arguments to create many HeroBanners.
     * @example
     * // Create many HeroBanners
     * const heroBanner = await prisma.heroBanner.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many HeroBanners and only return the `id`
     * const heroBannerWithIdOnly = await prisma.heroBanner.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends HeroBannerCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, HeroBannerCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$HeroBannerPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    /**
     * Delete a HeroBanner.
     * @param {HeroBannerDeleteArgs} args - Arguments to delete one HeroBanner.
     * @example
     * // Delete one HeroBanner
     * const HeroBanner = await prisma.heroBanner.delete({
     *   where: {
     *     // ... filter to delete one HeroBanner
     *   }
     * })
     *
     */
    delete<T extends HeroBannerDeleteArgs>(args: Prisma.SelectSubset<T, HeroBannerDeleteArgs<ExtArgs>>): Prisma.Prisma__HeroBannerClient<runtime.Types.Result.GetResult<Prisma.$HeroBannerPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Update one HeroBanner.
     * @param {HeroBannerUpdateArgs} args - Arguments to update one HeroBanner.
     * @example
     * // Update one HeroBanner
     * const heroBanner = await prisma.heroBanner.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends HeroBannerUpdateArgs>(args: Prisma.SelectSubset<T, HeroBannerUpdateArgs<ExtArgs>>): Prisma.Prisma__HeroBannerClient<runtime.Types.Result.GetResult<Prisma.$HeroBannerPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Delete zero or more HeroBanners.
     * @param {HeroBannerDeleteManyArgs} args - Arguments to filter HeroBanners to delete.
     * @example
     * // Delete a few HeroBanners
     * const { count } = await prisma.heroBanner.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends HeroBannerDeleteManyArgs>(args?: Prisma.SelectSubset<T, HeroBannerDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more HeroBanners.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {HeroBannerUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many HeroBanners
     * const heroBanner = await prisma.heroBanner.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends HeroBannerUpdateManyArgs>(args: Prisma.SelectSubset<T, HeroBannerUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more HeroBanners and returns the data updated in the database.
     * @param {HeroBannerUpdateManyAndReturnArgs} args - Arguments to update many HeroBanners.
     * @example
     * // Update many HeroBanners
     * const heroBanner = await prisma.heroBanner.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more HeroBanners and only return the `id`
     * const heroBannerWithIdOnly = await prisma.heroBanner.updateManyAndReturn({
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
    updateManyAndReturn<T extends HeroBannerUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, HeroBannerUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$HeroBannerPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    /**
     * Create or update one HeroBanner.
     * @param {HeroBannerUpsertArgs} args - Arguments to update or create a HeroBanner.
     * @example
     * // Update or create a HeroBanner
     * const heroBanner = await prisma.heroBanner.upsert({
     *   create: {
     *     // ... data to create a HeroBanner
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the HeroBanner we want to update
     *   }
     * })
     */
    upsert<T extends HeroBannerUpsertArgs>(args: Prisma.SelectSubset<T, HeroBannerUpsertArgs<ExtArgs>>): Prisma.Prisma__HeroBannerClient<runtime.Types.Result.GetResult<Prisma.$HeroBannerPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Count the number of HeroBanners.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {HeroBannerCountArgs} args - Arguments to filter HeroBanners to count.
     * @example
     * // Count the number of HeroBanners
     * const count = await prisma.heroBanner.count({
     *   where: {
     *     // ... the filter for the HeroBanners we want to count
     *   }
     * })
    **/
    count<T extends HeroBannerCountArgs>(args?: Prisma.Subset<T, HeroBannerCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], HeroBannerCountAggregateOutputType> : number>;
    /**
     * Allows you to perform aggregations operations on a HeroBanner.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {HeroBannerAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends HeroBannerAggregateArgs>(args: Prisma.Subset<T, HeroBannerAggregateArgs>): Prisma.PrismaPromise<GetHeroBannerAggregateType<T>>;
    /**
     * Group by HeroBanner.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {HeroBannerGroupByArgs} args - Group by arguments.
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
    groupBy<T extends HeroBannerGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: HeroBannerGroupByArgs['orderBy'];
    } : {
        orderBy?: HeroBannerGroupByArgs['orderBy'];
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
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, HeroBannerGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetHeroBannerGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the HeroBanner model
     */
    readonly fields: HeroBannerFieldRefs;
}
/**
 * The delegate class that acts as a "Promise-like" for HeroBanner.
 * Why is this prefixed with `Prisma__`?
 * Because we want to prevent naming conflicts as mentioned in
 * https://github.com/prisma/prisma-client-js/issues/707
 */
export interface Prisma__HeroBannerClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
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
 * Fields of the HeroBanner model
 */
export interface HeroBannerFieldRefs {
    readonly id: Prisma.FieldRef<"HeroBanner", 'Int'>;
    readonly imageFile: Prisma.FieldRef<"HeroBanner", 'String'>;
    readonly title: Prisma.FieldRef<"HeroBanner", 'String'>;
    readonly subtitle: Prisma.FieldRef<"HeroBanner", 'String'>;
    readonly order: Prisma.FieldRef<"HeroBanner", 'Int'>;
    readonly isActive: Prisma.FieldRef<"HeroBanner", 'Boolean'>;
    readonly createdAt: Prisma.FieldRef<"HeroBanner", 'DateTime'>;
}
/**
 * HeroBanner findUnique
 */
export type HeroBannerFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the HeroBanner
     */
    select?: Prisma.HeroBannerSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the HeroBanner
     */
    omit?: Prisma.HeroBannerOmit<ExtArgs> | null;
    /**
     * Filter, which HeroBanner to fetch.
     */
    where: Prisma.HeroBannerWhereUniqueInput;
};
/**
 * HeroBanner findUniqueOrThrow
 */
export type HeroBannerFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the HeroBanner
     */
    select?: Prisma.HeroBannerSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the HeroBanner
     */
    omit?: Prisma.HeroBannerOmit<ExtArgs> | null;
    /**
     * Filter, which HeroBanner to fetch.
     */
    where: Prisma.HeroBannerWhereUniqueInput;
};
/**
 * HeroBanner findFirst
 */
export type HeroBannerFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the HeroBanner
     */
    select?: Prisma.HeroBannerSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the HeroBanner
     */
    omit?: Prisma.HeroBannerOmit<ExtArgs> | null;
    /**
     * Filter, which HeroBanner to fetch.
     */
    where?: Prisma.HeroBannerWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of HeroBanners to fetch.
     */
    orderBy?: Prisma.HeroBannerOrderByWithRelationInput | Prisma.HeroBannerOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for HeroBanners.
     */
    cursor?: Prisma.HeroBannerWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` HeroBanners from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` HeroBanners.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of HeroBanners.
     */
    distinct?: Prisma.HeroBannerScalarFieldEnum | Prisma.HeroBannerScalarFieldEnum[];
};
/**
 * HeroBanner findFirstOrThrow
 */
export type HeroBannerFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the HeroBanner
     */
    select?: Prisma.HeroBannerSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the HeroBanner
     */
    omit?: Prisma.HeroBannerOmit<ExtArgs> | null;
    /**
     * Filter, which HeroBanner to fetch.
     */
    where?: Prisma.HeroBannerWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of HeroBanners to fetch.
     */
    orderBy?: Prisma.HeroBannerOrderByWithRelationInput | Prisma.HeroBannerOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for HeroBanners.
     */
    cursor?: Prisma.HeroBannerWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` HeroBanners from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` HeroBanners.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of HeroBanners.
     */
    distinct?: Prisma.HeroBannerScalarFieldEnum | Prisma.HeroBannerScalarFieldEnum[];
};
/**
 * HeroBanner findMany
 */
export type HeroBannerFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the HeroBanner
     */
    select?: Prisma.HeroBannerSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the HeroBanner
     */
    omit?: Prisma.HeroBannerOmit<ExtArgs> | null;
    /**
     * Filter, which HeroBanners to fetch.
     */
    where?: Prisma.HeroBannerWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of HeroBanners to fetch.
     */
    orderBy?: Prisma.HeroBannerOrderByWithRelationInput | Prisma.HeroBannerOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing HeroBanners.
     */
    cursor?: Prisma.HeroBannerWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` HeroBanners from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` HeroBanners.
     */
    skip?: number;
    distinct?: Prisma.HeroBannerScalarFieldEnum | Prisma.HeroBannerScalarFieldEnum[];
};
/**
 * HeroBanner create
 */
export type HeroBannerCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the HeroBanner
     */
    select?: Prisma.HeroBannerSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the HeroBanner
     */
    omit?: Prisma.HeroBannerOmit<ExtArgs> | null;
    /**
     * The data needed to create a HeroBanner.
     */
    data: Prisma.XOR<Prisma.HeroBannerCreateInput, Prisma.HeroBannerUncheckedCreateInput>;
};
/**
 * HeroBanner createMany
 */
export type HeroBannerCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to create many HeroBanners.
     */
    data: Prisma.HeroBannerCreateManyInput | Prisma.HeroBannerCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * HeroBanner createManyAndReturn
 */
export type HeroBannerCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the HeroBanner
     */
    select?: Prisma.HeroBannerSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the HeroBanner
     */
    omit?: Prisma.HeroBannerOmit<ExtArgs> | null;
    /**
     * The data used to create many HeroBanners.
     */
    data: Prisma.HeroBannerCreateManyInput | Prisma.HeroBannerCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * HeroBanner update
 */
export type HeroBannerUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the HeroBanner
     */
    select?: Prisma.HeroBannerSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the HeroBanner
     */
    omit?: Prisma.HeroBannerOmit<ExtArgs> | null;
    /**
     * The data needed to update a HeroBanner.
     */
    data: Prisma.XOR<Prisma.HeroBannerUpdateInput, Prisma.HeroBannerUncheckedUpdateInput>;
    /**
     * Choose, which HeroBanner to update.
     */
    where: Prisma.HeroBannerWhereUniqueInput;
};
/**
 * HeroBanner updateMany
 */
export type HeroBannerUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to update HeroBanners.
     */
    data: Prisma.XOR<Prisma.HeroBannerUpdateManyMutationInput, Prisma.HeroBannerUncheckedUpdateManyInput>;
    /**
     * Filter which HeroBanners to update
     */
    where?: Prisma.HeroBannerWhereInput;
    /**
     * Limit how many HeroBanners to update.
     */
    limit?: number;
};
/**
 * HeroBanner updateManyAndReturn
 */
export type HeroBannerUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the HeroBanner
     */
    select?: Prisma.HeroBannerSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the HeroBanner
     */
    omit?: Prisma.HeroBannerOmit<ExtArgs> | null;
    /**
     * The data used to update HeroBanners.
     */
    data: Prisma.XOR<Prisma.HeroBannerUpdateManyMutationInput, Prisma.HeroBannerUncheckedUpdateManyInput>;
    /**
     * Filter which HeroBanners to update
     */
    where?: Prisma.HeroBannerWhereInput;
    /**
     * Limit how many HeroBanners to update.
     */
    limit?: number;
};
/**
 * HeroBanner upsert
 */
export type HeroBannerUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the HeroBanner
     */
    select?: Prisma.HeroBannerSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the HeroBanner
     */
    omit?: Prisma.HeroBannerOmit<ExtArgs> | null;
    /**
     * The filter to search for the HeroBanner to update in case it exists.
     */
    where: Prisma.HeroBannerWhereUniqueInput;
    /**
     * In case the HeroBanner found by the `where` argument doesn't exist, create a new HeroBanner with this data.
     */
    create: Prisma.XOR<Prisma.HeroBannerCreateInput, Prisma.HeroBannerUncheckedCreateInput>;
    /**
     * In case the HeroBanner was found with the provided `where` argument, update it with this data.
     */
    update: Prisma.XOR<Prisma.HeroBannerUpdateInput, Prisma.HeroBannerUncheckedUpdateInput>;
};
/**
 * HeroBanner delete
 */
export type HeroBannerDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the HeroBanner
     */
    select?: Prisma.HeroBannerSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the HeroBanner
     */
    omit?: Prisma.HeroBannerOmit<ExtArgs> | null;
    /**
     * Filter which HeroBanner to delete.
     */
    where: Prisma.HeroBannerWhereUniqueInput;
};
/**
 * HeroBanner deleteMany
 */
export type HeroBannerDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which HeroBanners to delete
     */
    where?: Prisma.HeroBannerWhereInput;
    /**
     * Limit how many HeroBanners to delete.
     */
    limit?: number;
};
/**
 * HeroBanner without action
 */
export type HeroBannerDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the HeroBanner
     */
    select?: Prisma.HeroBannerSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the HeroBanner
     */
    omit?: Prisma.HeroBannerOmit<ExtArgs> | null;
};
export {};
//# sourceMappingURL=HeroBanner.d.ts.map