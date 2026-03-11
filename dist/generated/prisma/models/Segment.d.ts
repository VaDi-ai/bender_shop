import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace";
/**
 * Model Segment
 *
 */
export type SegmentModel = runtime.Types.Result.DefaultSelection<Prisma.$SegmentPayload>;
export type AggregateSegment = {
    _count: SegmentCountAggregateOutputType | null;
    _avg: SegmentAvgAggregateOutputType | null;
    _sum: SegmentSumAggregateOutputType | null;
    _min: SegmentMinAggregateOutputType | null;
    _max: SegmentMaxAggregateOutputType | null;
};
export type SegmentAvgAggregateOutputType = {
    id: number | null;
};
export type SegmentSumAggregateOutputType = {
    id: number | null;
};
export type SegmentMinAggregateOutputType = {
    id: number | null;
    name: string | null;
    isDefault: boolean | null;
    color: string | null;
    createdAt: Date | null;
};
export type SegmentMaxAggregateOutputType = {
    id: number | null;
    name: string | null;
    isDefault: boolean | null;
    color: string | null;
    createdAt: Date | null;
};
export type SegmentCountAggregateOutputType = {
    id: number;
    name: number;
    isDefault: number;
    color: number;
    createdAt: number;
    _all: number;
};
export type SegmentAvgAggregateInputType = {
    id?: true;
};
export type SegmentSumAggregateInputType = {
    id?: true;
};
export type SegmentMinAggregateInputType = {
    id?: true;
    name?: true;
    isDefault?: true;
    color?: true;
    createdAt?: true;
};
export type SegmentMaxAggregateInputType = {
    id?: true;
    name?: true;
    isDefault?: true;
    color?: true;
    createdAt?: true;
};
export type SegmentCountAggregateInputType = {
    id?: true;
    name?: true;
    isDefault?: true;
    color?: true;
    createdAt?: true;
    _all?: true;
};
export type SegmentAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which Segment to aggregate.
     */
    where?: Prisma.SegmentWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Segments to fetch.
     */
    orderBy?: Prisma.SegmentOrderByWithRelationInput | Prisma.SegmentOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: Prisma.SegmentWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Segments from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Segments.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned Segments
    **/
    _count?: true | SegmentCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to average
    **/
    _avg?: SegmentAvgAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to sum
    **/
    _sum?: SegmentSumAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
    **/
    _min?: SegmentMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
    **/
    _max?: SegmentMaxAggregateInputType;
};
export type GetSegmentAggregateType<T extends SegmentAggregateArgs> = {
    [P in keyof T & keyof AggregateSegment]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateSegment[P]> : Prisma.GetScalarType<T[P], AggregateSegment[P]>;
};
export type SegmentGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.SegmentWhereInput;
    orderBy?: Prisma.SegmentOrderByWithAggregationInput | Prisma.SegmentOrderByWithAggregationInput[];
    by: Prisma.SegmentScalarFieldEnum[] | Prisma.SegmentScalarFieldEnum;
    having?: Prisma.SegmentScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: SegmentCountAggregateInputType | true;
    _avg?: SegmentAvgAggregateInputType;
    _sum?: SegmentSumAggregateInputType;
    _min?: SegmentMinAggregateInputType;
    _max?: SegmentMaxAggregateInputType;
};
export type SegmentGroupByOutputType = {
    id: number;
    name: string;
    isDefault: boolean;
    color: string;
    createdAt: Date;
    _count: SegmentCountAggregateOutputType | null;
    _avg: SegmentAvgAggregateOutputType | null;
    _sum: SegmentSumAggregateOutputType | null;
    _min: SegmentMinAggregateOutputType | null;
    _max: SegmentMaxAggregateOutputType | null;
};
type GetSegmentGroupByPayload<T extends SegmentGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<SegmentGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof SegmentGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], SegmentGroupByOutputType[P]> : Prisma.GetScalarType<T[P], SegmentGroupByOutputType[P]>;
}>>;
export type SegmentWhereInput = {
    AND?: Prisma.SegmentWhereInput | Prisma.SegmentWhereInput[];
    OR?: Prisma.SegmentWhereInput[];
    NOT?: Prisma.SegmentWhereInput | Prisma.SegmentWhereInput[];
    id?: Prisma.IntFilter<"Segment"> | number;
    name?: Prisma.StringFilter<"Segment"> | string;
    isDefault?: Prisma.BoolFilter<"Segment"> | boolean;
    color?: Prisma.StringFilter<"Segment"> | string;
    createdAt?: Prisma.DateTimeFilter<"Segment"> | Date | string;
    clients?: Prisma.ClientListRelationFilter;
};
export type SegmentOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    isDefault?: Prisma.SortOrder;
    color?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    clients?: Prisma.ClientOrderByRelationAggregateInput;
};
export type SegmentWhereUniqueInput = Prisma.AtLeast<{
    id?: number;
    name?: string;
    AND?: Prisma.SegmentWhereInput | Prisma.SegmentWhereInput[];
    OR?: Prisma.SegmentWhereInput[];
    NOT?: Prisma.SegmentWhereInput | Prisma.SegmentWhereInput[];
    isDefault?: Prisma.BoolFilter<"Segment"> | boolean;
    color?: Prisma.StringFilter<"Segment"> | string;
    createdAt?: Prisma.DateTimeFilter<"Segment"> | Date | string;
    clients?: Prisma.ClientListRelationFilter;
}, "id" | "name">;
export type SegmentOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    isDefault?: Prisma.SortOrder;
    color?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    _count?: Prisma.SegmentCountOrderByAggregateInput;
    _avg?: Prisma.SegmentAvgOrderByAggregateInput;
    _max?: Prisma.SegmentMaxOrderByAggregateInput;
    _min?: Prisma.SegmentMinOrderByAggregateInput;
    _sum?: Prisma.SegmentSumOrderByAggregateInput;
};
export type SegmentScalarWhereWithAggregatesInput = {
    AND?: Prisma.SegmentScalarWhereWithAggregatesInput | Prisma.SegmentScalarWhereWithAggregatesInput[];
    OR?: Prisma.SegmentScalarWhereWithAggregatesInput[];
    NOT?: Prisma.SegmentScalarWhereWithAggregatesInput | Prisma.SegmentScalarWhereWithAggregatesInput[];
    id?: Prisma.IntWithAggregatesFilter<"Segment"> | number;
    name?: Prisma.StringWithAggregatesFilter<"Segment"> | string;
    isDefault?: Prisma.BoolWithAggregatesFilter<"Segment"> | boolean;
    color?: Prisma.StringWithAggregatesFilter<"Segment"> | string;
    createdAt?: Prisma.DateTimeWithAggregatesFilter<"Segment"> | Date | string;
};
export type SegmentCreateInput = {
    name: string;
    isDefault?: boolean;
    color: string;
    createdAt?: Date | string;
    clients?: Prisma.ClientCreateNestedManyWithoutSegmentInput;
};
export type SegmentUncheckedCreateInput = {
    id?: number;
    name: string;
    isDefault?: boolean;
    color: string;
    createdAt?: Date | string;
    clients?: Prisma.ClientUncheckedCreateNestedManyWithoutSegmentInput;
};
export type SegmentUpdateInput = {
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    isDefault?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    color?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    clients?: Prisma.ClientUpdateManyWithoutSegmentNestedInput;
};
export type SegmentUncheckedUpdateInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    isDefault?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    color?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    clients?: Prisma.ClientUncheckedUpdateManyWithoutSegmentNestedInput;
};
export type SegmentCreateManyInput = {
    id?: number;
    name: string;
    isDefault?: boolean;
    color: string;
    createdAt?: Date | string;
};
export type SegmentUpdateManyMutationInput = {
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    isDefault?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    color?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type SegmentUncheckedUpdateManyInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    isDefault?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    color?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type SegmentCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    isDefault?: Prisma.SortOrder;
    color?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
};
export type SegmentAvgOrderByAggregateInput = {
    id?: Prisma.SortOrder;
};
export type SegmentMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    isDefault?: Prisma.SortOrder;
    color?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
};
export type SegmentMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    isDefault?: Prisma.SortOrder;
    color?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
};
export type SegmentSumOrderByAggregateInput = {
    id?: Prisma.SortOrder;
};
export type SegmentNullableScalarRelationFilter = {
    is?: Prisma.SegmentWhereInput | null;
    isNot?: Prisma.SegmentWhereInput | null;
};
export type StringFieldUpdateOperationsInput = {
    set?: string;
};
export type BoolFieldUpdateOperationsInput = {
    set?: boolean;
};
export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string;
};
export type IntFieldUpdateOperationsInput = {
    set?: number;
    increment?: number;
    decrement?: number;
    multiply?: number;
    divide?: number;
};
export type SegmentCreateNestedOneWithoutClientsInput = {
    create?: Prisma.XOR<Prisma.SegmentCreateWithoutClientsInput, Prisma.SegmentUncheckedCreateWithoutClientsInput>;
    connectOrCreate?: Prisma.SegmentCreateOrConnectWithoutClientsInput;
    connect?: Prisma.SegmentWhereUniqueInput;
};
export type SegmentUpdateOneWithoutClientsNestedInput = {
    create?: Prisma.XOR<Prisma.SegmentCreateWithoutClientsInput, Prisma.SegmentUncheckedCreateWithoutClientsInput>;
    connectOrCreate?: Prisma.SegmentCreateOrConnectWithoutClientsInput;
    upsert?: Prisma.SegmentUpsertWithoutClientsInput;
    disconnect?: Prisma.SegmentWhereInput | boolean;
    delete?: Prisma.SegmentWhereInput | boolean;
    connect?: Prisma.SegmentWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.SegmentUpdateToOneWithWhereWithoutClientsInput, Prisma.SegmentUpdateWithoutClientsInput>, Prisma.SegmentUncheckedUpdateWithoutClientsInput>;
};
export type SegmentCreateWithoutClientsInput = {
    name: string;
    isDefault?: boolean;
    color: string;
    createdAt?: Date | string;
};
export type SegmentUncheckedCreateWithoutClientsInput = {
    id?: number;
    name: string;
    isDefault?: boolean;
    color: string;
    createdAt?: Date | string;
};
export type SegmentCreateOrConnectWithoutClientsInput = {
    where: Prisma.SegmentWhereUniqueInput;
    create: Prisma.XOR<Prisma.SegmentCreateWithoutClientsInput, Prisma.SegmentUncheckedCreateWithoutClientsInput>;
};
export type SegmentUpsertWithoutClientsInput = {
    update: Prisma.XOR<Prisma.SegmentUpdateWithoutClientsInput, Prisma.SegmentUncheckedUpdateWithoutClientsInput>;
    create: Prisma.XOR<Prisma.SegmentCreateWithoutClientsInput, Prisma.SegmentUncheckedCreateWithoutClientsInput>;
    where?: Prisma.SegmentWhereInput;
};
export type SegmentUpdateToOneWithWhereWithoutClientsInput = {
    where?: Prisma.SegmentWhereInput;
    data: Prisma.XOR<Prisma.SegmentUpdateWithoutClientsInput, Prisma.SegmentUncheckedUpdateWithoutClientsInput>;
};
export type SegmentUpdateWithoutClientsInput = {
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    isDefault?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    color?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type SegmentUncheckedUpdateWithoutClientsInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    isDefault?: Prisma.BoolFieldUpdateOperationsInput | boolean;
    color?: Prisma.StringFieldUpdateOperationsInput | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
/**
 * Count Type SegmentCountOutputType
 */
export type SegmentCountOutputType = {
    clients: number;
};
export type SegmentCountOutputTypeSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    clients?: boolean | SegmentCountOutputTypeCountClientsArgs;
};
/**
 * SegmentCountOutputType without action
 */
export type SegmentCountOutputTypeDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SegmentCountOutputType
     */
    select?: Prisma.SegmentCountOutputTypeSelect<ExtArgs> | null;
};
/**
 * SegmentCountOutputType without action
 */
export type SegmentCountOutputTypeCountClientsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.ClientWhereInput;
};
export type SegmentSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    name?: boolean;
    isDefault?: boolean;
    color?: boolean;
    createdAt?: boolean;
    clients?: boolean | Prisma.Segment$clientsArgs<ExtArgs>;
    _count?: boolean | Prisma.SegmentCountOutputTypeDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["segment"]>;
export type SegmentSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    name?: boolean;
    isDefault?: boolean;
    color?: boolean;
    createdAt?: boolean;
}, ExtArgs["result"]["segment"]>;
export type SegmentSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    name?: boolean;
    isDefault?: boolean;
    color?: boolean;
    createdAt?: boolean;
}, ExtArgs["result"]["segment"]>;
export type SegmentSelectScalar = {
    id?: boolean;
    name?: boolean;
    isDefault?: boolean;
    color?: boolean;
    createdAt?: boolean;
};
export type SegmentOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "name" | "isDefault" | "color" | "createdAt", ExtArgs["result"]["segment"]>;
export type SegmentInclude<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    clients?: boolean | Prisma.Segment$clientsArgs<ExtArgs>;
    _count?: boolean | Prisma.SegmentCountOutputTypeDefaultArgs<ExtArgs>;
};
export type SegmentIncludeCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {};
export type SegmentIncludeUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {};
export type $SegmentPayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "Segment";
    objects: {
        clients: Prisma.$ClientPayload<ExtArgs>[];
    };
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: number;
        name: string;
        isDefault: boolean;
        color: string;
        createdAt: Date;
    }, ExtArgs["result"]["segment"]>;
    composites: {};
};
export type SegmentGetPayload<S extends boolean | null | undefined | SegmentDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$SegmentPayload, S>;
export type SegmentCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<SegmentFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: SegmentCountAggregateInputType | true;
};
export interface SegmentDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['Segment'];
        meta: {
            name: 'Segment';
        };
    };
    /**
     * Find zero or one Segment that matches the filter.
     * @param {SegmentFindUniqueArgs} args - Arguments to find a Segment
     * @example
     * // Get one Segment
     * const segment = await prisma.segment.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SegmentFindUniqueArgs>(args: Prisma.SelectSubset<T, SegmentFindUniqueArgs<ExtArgs>>): Prisma.Prisma__SegmentClient<runtime.Types.Result.GetResult<Prisma.$SegmentPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find one Segment that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SegmentFindUniqueOrThrowArgs} args - Arguments to find a Segment
     * @example
     * // Get one Segment
     * const segment = await prisma.segment.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SegmentFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, SegmentFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__SegmentClient<runtime.Types.Result.GetResult<Prisma.$SegmentPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first Segment that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SegmentFindFirstArgs} args - Arguments to find a Segment
     * @example
     * // Get one Segment
     * const segment = await prisma.segment.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SegmentFindFirstArgs>(args?: Prisma.SelectSubset<T, SegmentFindFirstArgs<ExtArgs>>): Prisma.Prisma__SegmentClient<runtime.Types.Result.GetResult<Prisma.$SegmentPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first Segment that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SegmentFindFirstOrThrowArgs} args - Arguments to find a Segment
     * @example
     * // Get one Segment
     * const segment = await prisma.segment.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SegmentFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, SegmentFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__SegmentClient<runtime.Types.Result.GetResult<Prisma.$SegmentPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find zero or more Segments that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SegmentFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Segments
     * const segments = await prisma.segment.findMany()
     *
     * // Get first 10 Segments
     * const segments = await prisma.segment.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const segmentWithIdOnly = await prisma.segment.findMany({ select: { id: true } })
     *
     */
    findMany<T extends SegmentFindManyArgs>(args?: Prisma.SelectSubset<T, SegmentFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$SegmentPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    /**
     * Create a Segment.
     * @param {SegmentCreateArgs} args - Arguments to create a Segment.
     * @example
     * // Create one Segment
     * const Segment = await prisma.segment.create({
     *   data: {
     *     // ... data to create a Segment
     *   }
     * })
     *
     */
    create<T extends SegmentCreateArgs>(args: Prisma.SelectSubset<T, SegmentCreateArgs<ExtArgs>>): Prisma.Prisma__SegmentClient<runtime.Types.Result.GetResult<Prisma.$SegmentPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Create many Segments.
     * @param {SegmentCreateManyArgs} args - Arguments to create many Segments.
     * @example
     * // Create many Segments
     * const segment = await prisma.segment.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends SegmentCreateManyArgs>(args?: Prisma.SelectSubset<T, SegmentCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Create many Segments and returns the data saved in the database.
     * @param {SegmentCreateManyAndReturnArgs} args - Arguments to create many Segments.
     * @example
     * // Create many Segments
     * const segment = await prisma.segment.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many Segments and only return the `id`
     * const segmentWithIdOnly = await prisma.segment.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends SegmentCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, SegmentCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$SegmentPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    /**
     * Delete a Segment.
     * @param {SegmentDeleteArgs} args - Arguments to delete one Segment.
     * @example
     * // Delete one Segment
     * const Segment = await prisma.segment.delete({
     *   where: {
     *     // ... filter to delete one Segment
     *   }
     * })
     *
     */
    delete<T extends SegmentDeleteArgs>(args: Prisma.SelectSubset<T, SegmentDeleteArgs<ExtArgs>>): Prisma.Prisma__SegmentClient<runtime.Types.Result.GetResult<Prisma.$SegmentPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Update one Segment.
     * @param {SegmentUpdateArgs} args - Arguments to update one Segment.
     * @example
     * // Update one Segment
     * const segment = await prisma.segment.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends SegmentUpdateArgs>(args: Prisma.SelectSubset<T, SegmentUpdateArgs<ExtArgs>>): Prisma.Prisma__SegmentClient<runtime.Types.Result.GetResult<Prisma.$SegmentPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Delete zero or more Segments.
     * @param {SegmentDeleteManyArgs} args - Arguments to filter Segments to delete.
     * @example
     * // Delete a few Segments
     * const { count } = await prisma.segment.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends SegmentDeleteManyArgs>(args?: Prisma.SelectSubset<T, SegmentDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more Segments.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SegmentUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Segments
     * const segment = await prisma.segment.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends SegmentUpdateManyArgs>(args: Prisma.SelectSubset<T, SegmentUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more Segments and returns the data updated in the database.
     * @param {SegmentUpdateManyAndReturnArgs} args - Arguments to update many Segments.
     * @example
     * // Update many Segments
     * const segment = await prisma.segment.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more Segments and only return the `id`
     * const segmentWithIdOnly = await prisma.segment.updateManyAndReturn({
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
    updateManyAndReturn<T extends SegmentUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, SegmentUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$SegmentPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    /**
     * Create or update one Segment.
     * @param {SegmentUpsertArgs} args - Arguments to update or create a Segment.
     * @example
     * // Update or create a Segment
     * const segment = await prisma.segment.upsert({
     *   create: {
     *     // ... data to create a Segment
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Segment we want to update
     *   }
     * })
     */
    upsert<T extends SegmentUpsertArgs>(args: Prisma.SelectSubset<T, SegmentUpsertArgs<ExtArgs>>): Prisma.Prisma__SegmentClient<runtime.Types.Result.GetResult<Prisma.$SegmentPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Count the number of Segments.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SegmentCountArgs} args - Arguments to filter Segments to count.
     * @example
     * // Count the number of Segments
     * const count = await prisma.segment.count({
     *   where: {
     *     // ... the filter for the Segments we want to count
     *   }
     * })
    **/
    count<T extends SegmentCountArgs>(args?: Prisma.Subset<T, SegmentCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], SegmentCountAggregateOutputType> : number>;
    /**
     * Allows you to perform aggregations operations on a Segment.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SegmentAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends SegmentAggregateArgs>(args: Prisma.Subset<T, SegmentAggregateArgs>): Prisma.PrismaPromise<GetSegmentAggregateType<T>>;
    /**
     * Group by Segment.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SegmentGroupByArgs} args - Group by arguments.
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
    groupBy<T extends SegmentGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: SegmentGroupByArgs['orderBy'];
    } : {
        orderBy?: SegmentGroupByArgs['orderBy'];
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
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, SegmentGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSegmentGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the Segment model
     */
    readonly fields: SegmentFieldRefs;
}
/**
 * The delegate class that acts as a "Promise-like" for Segment.
 * Why is this prefixed with `Prisma__`?
 * Because we want to prevent naming conflicts as mentioned in
 * https://github.com/prisma/prisma-client-js/issues/707
 */
export interface Prisma__SegmentClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    clients<T extends Prisma.Segment$clientsArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.Segment$clientsArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
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
 * Fields of the Segment model
 */
export interface SegmentFieldRefs {
    readonly id: Prisma.FieldRef<"Segment", 'Int'>;
    readonly name: Prisma.FieldRef<"Segment", 'String'>;
    readonly isDefault: Prisma.FieldRef<"Segment", 'Boolean'>;
    readonly color: Prisma.FieldRef<"Segment", 'String'>;
    readonly createdAt: Prisma.FieldRef<"Segment", 'DateTime'>;
}
/**
 * Segment findUnique
 */
export type SegmentFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Segment
     */
    select?: Prisma.SegmentSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Segment
     */
    omit?: Prisma.SegmentOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.SegmentInclude<ExtArgs> | null;
    /**
     * Filter, which Segment to fetch.
     */
    where: Prisma.SegmentWhereUniqueInput;
};
/**
 * Segment findUniqueOrThrow
 */
export type SegmentFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Segment
     */
    select?: Prisma.SegmentSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Segment
     */
    omit?: Prisma.SegmentOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.SegmentInclude<ExtArgs> | null;
    /**
     * Filter, which Segment to fetch.
     */
    where: Prisma.SegmentWhereUniqueInput;
};
/**
 * Segment findFirst
 */
export type SegmentFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Segment
     */
    select?: Prisma.SegmentSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Segment
     */
    omit?: Prisma.SegmentOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.SegmentInclude<ExtArgs> | null;
    /**
     * Filter, which Segment to fetch.
     */
    where?: Prisma.SegmentWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Segments to fetch.
     */
    orderBy?: Prisma.SegmentOrderByWithRelationInput | Prisma.SegmentOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Segments.
     */
    cursor?: Prisma.SegmentWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Segments from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Segments.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Segments.
     */
    distinct?: Prisma.SegmentScalarFieldEnum | Prisma.SegmentScalarFieldEnum[];
};
/**
 * Segment findFirstOrThrow
 */
export type SegmentFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Segment
     */
    select?: Prisma.SegmentSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Segment
     */
    omit?: Prisma.SegmentOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.SegmentInclude<ExtArgs> | null;
    /**
     * Filter, which Segment to fetch.
     */
    where?: Prisma.SegmentWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Segments to fetch.
     */
    orderBy?: Prisma.SegmentOrderByWithRelationInput | Prisma.SegmentOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Segments.
     */
    cursor?: Prisma.SegmentWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Segments from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Segments.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Segments.
     */
    distinct?: Prisma.SegmentScalarFieldEnum | Prisma.SegmentScalarFieldEnum[];
};
/**
 * Segment findMany
 */
export type SegmentFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Segment
     */
    select?: Prisma.SegmentSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Segment
     */
    omit?: Prisma.SegmentOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.SegmentInclude<ExtArgs> | null;
    /**
     * Filter, which Segments to fetch.
     */
    where?: Prisma.SegmentWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Segments to fetch.
     */
    orderBy?: Prisma.SegmentOrderByWithRelationInput | Prisma.SegmentOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing Segments.
     */
    cursor?: Prisma.SegmentWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Segments from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Segments.
     */
    skip?: number;
    distinct?: Prisma.SegmentScalarFieldEnum | Prisma.SegmentScalarFieldEnum[];
};
/**
 * Segment create
 */
export type SegmentCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Segment
     */
    select?: Prisma.SegmentSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Segment
     */
    omit?: Prisma.SegmentOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.SegmentInclude<ExtArgs> | null;
    /**
     * The data needed to create a Segment.
     */
    data: Prisma.XOR<Prisma.SegmentCreateInput, Prisma.SegmentUncheckedCreateInput>;
};
/**
 * Segment createMany
 */
export type SegmentCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to create many Segments.
     */
    data: Prisma.SegmentCreateManyInput | Prisma.SegmentCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * Segment createManyAndReturn
 */
export type SegmentCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Segment
     */
    select?: Prisma.SegmentSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the Segment
     */
    omit?: Prisma.SegmentOmit<ExtArgs> | null;
    /**
     * The data used to create many Segments.
     */
    data: Prisma.SegmentCreateManyInput | Prisma.SegmentCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * Segment update
 */
export type SegmentUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Segment
     */
    select?: Prisma.SegmentSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Segment
     */
    omit?: Prisma.SegmentOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.SegmentInclude<ExtArgs> | null;
    /**
     * The data needed to update a Segment.
     */
    data: Prisma.XOR<Prisma.SegmentUpdateInput, Prisma.SegmentUncheckedUpdateInput>;
    /**
     * Choose, which Segment to update.
     */
    where: Prisma.SegmentWhereUniqueInput;
};
/**
 * Segment updateMany
 */
export type SegmentUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to update Segments.
     */
    data: Prisma.XOR<Prisma.SegmentUpdateManyMutationInput, Prisma.SegmentUncheckedUpdateManyInput>;
    /**
     * Filter which Segments to update
     */
    where?: Prisma.SegmentWhereInput;
    /**
     * Limit how many Segments to update.
     */
    limit?: number;
};
/**
 * Segment updateManyAndReturn
 */
export type SegmentUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Segment
     */
    select?: Prisma.SegmentSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the Segment
     */
    omit?: Prisma.SegmentOmit<ExtArgs> | null;
    /**
     * The data used to update Segments.
     */
    data: Prisma.XOR<Prisma.SegmentUpdateManyMutationInput, Prisma.SegmentUncheckedUpdateManyInput>;
    /**
     * Filter which Segments to update
     */
    where?: Prisma.SegmentWhereInput;
    /**
     * Limit how many Segments to update.
     */
    limit?: number;
};
/**
 * Segment upsert
 */
export type SegmentUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Segment
     */
    select?: Prisma.SegmentSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Segment
     */
    omit?: Prisma.SegmentOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.SegmentInclude<ExtArgs> | null;
    /**
     * The filter to search for the Segment to update in case it exists.
     */
    where: Prisma.SegmentWhereUniqueInput;
    /**
     * In case the Segment found by the `where` argument doesn't exist, create a new Segment with this data.
     */
    create: Prisma.XOR<Prisma.SegmentCreateInput, Prisma.SegmentUncheckedCreateInput>;
    /**
     * In case the Segment was found with the provided `where` argument, update it with this data.
     */
    update: Prisma.XOR<Prisma.SegmentUpdateInput, Prisma.SegmentUncheckedUpdateInput>;
};
/**
 * Segment delete
 */
export type SegmentDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Segment
     */
    select?: Prisma.SegmentSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Segment
     */
    omit?: Prisma.SegmentOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.SegmentInclude<ExtArgs> | null;
    /**
     * Filter which Segment to delete.
     */
    where: Prisma.SegmentWhereUniqueInput;
};
/**
 * Segment deleteMany
 */
export type SegmentDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which Segments to delete
     */
    where?: Prisma.SegmentWhereInput;
    /**
     * Limit how many Segments to delete.
     */
    limit?: number;
};
/**
 * Segment.clients
 */
export type Segment$clientsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Client
     */
    select?: Prisma.ClientSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Client
     */
    omit?: Prisma.ClientOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ClientInclude<ExtArgs> | null;
    where?: Prisma.ClientWhereInput;
    orderBy?: Prisma.ClientOrderByWithRelationInput | Prisma.ClientOrderByWithRelationInput[];
    cursor?: Prisma.ClientWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.ClientScalarFieldEnum | Prisma.ClientScalarFieldEnum[];
};
/**
 * Segment without action
 */
export type SegmentDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Segment
     */
    select?: Prisma.SegmentSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Segment
     */
    omit?: Prisma.SegmentOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.SegmentInclude<ExtArgs> | null;
};
export {};
//# sourceMappingURL=Segment.d.ts.map