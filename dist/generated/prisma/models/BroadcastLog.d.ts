import type * as runtime from "@prisma/client/runtime/client";
import type * as Prisma from "../internal/prismaNamespace";
/**
 * Model BroadcastLog
 *
 */
export type BroadcastLogModel = runtime.Types.Result.DefaultSelection<Prisma.$BroadcastLogPayload>;
export type AggregateBroadcastLog = {
    _count: BroadcastLogCountAggregateOutputType | null;
    _avg: BroadcastLogAvgAggregateOutputType | null;
    _sum: BroadcastLogSumAggregateOutputType | null;
    _min: BroadcastLogMinAggregateOutputType | null;
    _max: BroadcastLogMaxAggregateOutputType | null;
};
export type BroadcastLogAvgAggregateOutputType = {
    id: number | null;
    totalSent: number | null;
    totalFailed: number | null;
    adminTelegramId: number | null;
};
export type BroadcastLogSumAggregateOutputType = {
    id: number | null;
    totalSent: number | null;
    totalFailed: number | null;
    adminTelegramId: bigint | null;
};
export type BroadcastLogMinAggregateOutputType = {
    id: number | null;
    type: string | null;
    target: string | null;
    messageText: string | null;
    mediaFileId: string | null;
    mediaType: string | null;
    totalSent: number | null;
    totalFailed: number | null;
    createdAt: Date | null;
    createdBy: string | null;
    adminTelegramId: bigint | null;
};
export type BroadcastLogMaxAggregateOutputType = {
    id: number | null;
    type: string | null;
    target: string | null;
    messageText: string | null;
    mediaFileId: string | null;
    mediaType: string | null;
    totalSent: number | null;
    totalFailed: number | null;
    createdAt: Date | null;
    createdBy: string | null;
    adminTelegramId: bigint | null;
};
export type BroadcastLogCountAggregateOutputType = {
    id: number;
    type: number;
    target: number;
    messageText: number;
    mediaFileId: number;
    mediaType: number;
    totalSent: number;
    totalFailed: number;
    createdAt: number;
    createdBy: number;
    adminTelegramId: number;
    _all: number;
};
export type BroadcastLogAvgAggregateInputType = {
    id?: true;
    totalSent?: true;
    totalFailed?: true;
    adminTelegramId?: true;
};
export type BroadcastLogSumAggregateInputType = {
    id?: true;
    totalSent?: true;
    totalFailed?: true;
    adminTelegramId?: true;
};
export type BroadcastLogMinAggregateInputType = {
    id?: true;
    type?: true;
    target?: true;
    messageText?: true;
    mediaFileId?: true;
    mediaType?: true;
    totalSent?: true;
    totalFailed?: true;
    createdAt?: true;
    createdBy?: true;
    adminTelegramId?: true;
};
export type BroadcastLogMaxAggregateInputType = {
    id?: true;
    type?: true;
    target?: true;
    messageText?: true;
    mediaFileId?: true;
    mediaType?: true;
    totalSent?: true;
    totalFailed?: true;
    createdAt?: true;
    createdBy?: true;
    adminTelegramId?: true;
};
export type BroadcastLogCountAggregateInputType = {
    id?: true;
    type?: true;
    target?: true;
    messageText?: true;
    mediaFileId?: true;
    mediaType?: true;
    totalSent?: true;
    totalFailed?: true;
    createdAt?: true;
    createdBy?: true;
    adminTelegramId?: true;
    _all?: true;
};
export type BroadcastLogAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which BroadcastLog to aggregate.
     */
    where?: Prisma.BroadcastLogWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of BroadcastLogs to fetch.
     */
    orderBy?: Prisma.BroadcastLogOrderByWithRelationInput | Prisma.BroadcastLogOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: Prisma.BroadcastLogWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` BroadcastLogs from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` BroadcastLogs.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned BroadcastLogs
    **/
    _count?: true | BroadcastLogCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to average
    **/
    _avg?: BroadcastLogAvgAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to sum
    **/
    _sum?: BroadcastLogSumAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
    **/
    _min?: BroadcastLogMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
    **/
    _max?: BroadcastLogMaxAggregateInputType;
};
export type GetBroadcastLogAggregateType<T extends BroadcastLogAggregateArgs> = {
    [P in keyof T & keyof AggregateBroadcastLog]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateBroadcastLog[P]> : Prisma.GetScalarType<T[P], AggregateBroadcastLog[P]>;
};
export type BroadcastLogGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.BroadcastLogWhereInput;
    orderBy?: Prisma.BroadcastLogOrderByWithAggregationInput | Prisma.BroadcastLogOrderByWithAggregationInput[];
    by: Prisma.BroadcastLogScalarFieldEnum[] | Prisma.BroadcastLogScalarFieldEnum;
    having?: Prisma.BroadcastLogScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: BroadcastLogCountAggregateInputType | true;
    _avg?: BroadcastLogAvgAggregateInputType;
    _sum?: BroadcastLogSumAggregateInputType;
    _min?: BroadcastLogMinAggregateInputType;
    _max?: BroadcastLogMaxAggregateInputType;
};
export type BroadcastLogGroupByOutputType = {
    id: number;
    type: string;
    target: string;
    messageText: string | null;
    mediaFileId: string | null;
    mediaType: string | null;
    totalSent: number;
    totalFailed: number;
    createdAt: Date;
    createdBy: string;
    adminTelegramId: bigint | null;
    _count: BroadcastLogCountAggregateOutputType | null;
    _avg: BroadcastLogAvgAggregateOutputType | null;
    _sum: BroadcastLogSumAggregateOutputType | null;
    _min: BroadcastLogMinAggregateOutputType | null;
    _max: BroadcastLogMaxAggregateOutputType | null;
};
type GetBroadcastLogGroupByPayload<T extends BroadcastLogGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<BroadcastLogGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof BroadcastLogGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], BroadcastLogGroupByOutputType[P]> : Prisma.GetScalarType<T[P], BroadcastLogGroupByOutputType[P]>;
}>>;
export type BroadcastLogWhereInput = {
    AND?: Prisma.BroadcastLogWhereInput | Prisma.BroadcastLogWhereInput[];
    OR?: Prisma.BroadcastLogWhereInput[];
    NOT?: Prisma.BroadcastLogWhereInput | Prisma.BroadcastLogWhereInput[];
    id?: Prisma.IntFilter<"BroadcastLog"> | number;
    type?: Prisma.StringFilter<"BroadcastLog"> | string;
    target?: Prisma.StringFilter<"BroadcastLog"> | string;
    messageText?: Prisma.StringNullableFilter<"BroadcastLog"> | string | null;
    mediaFileId?: Prisma.StringNullableFilter<"BroadcastLog"> | string | null;
    mediaType?: Prisma.StringNullableFilter<"BroadcastLog"> | string | null;
    totalSent?: Prisma.IntFilter<"BroadcastLog"> | number;
    totalFailed?: Prisma.IntFilter<"BroadcastLog"> | number;
    createdAt?: Prisma.DateTimeFilter<"BroadcastLog"> | Date | string;
    createdBy?: Prisma.StringFilter<"BroadcastLog"> | string;
    adminTelegramId?: Prisma.BigIntNullableFilter<"BroadcastLog"> | bigint | number | null;
};
export type BroadcastLogOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    type?: Prisma.SortOrder;
    target?: Prisma.SortOrder;
    messageText?: Prisma.SortOrderInput | Prisma.SortOrder;
    mediaFileId?: Prisma.SortOrderInput | Prisma.SortOrder;
    mediaType?: Prisma.SortOrderInput | Prisma.SortOrder;
    totalSent?: Prisma.SortOrder;
    totalFailed?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    createdBy?: Prisma.SortOrder;
    adminTelegramId?: Prisma.SortOrderInput | Prisma.SortOrder;
};
export type BroadcastLogWhereUniqueInput = Prisma.AtLeast<{
    id?: number;
    AND?: Prisma.BroadcastLogWhereInput | Prisma.BroadcastLogWhereInput[];
    OR?: Prisma.BroadcastLogWhereInput[];
    NOT?: Prisma.BroadcastLogWhereInput | Prisma.BroadcastLogWhereInput[];
    type?: Prisma.StringFilter<"BroadcastLog"> | string;
    target?: Prisma.StringFilter<"BroadcastLog"> | string;
    messageText?: Prisma.StringNullableFilter<"BroadcastLog"> | string | null;
    mediaFileId?: Prisma.StringNullableFilter<"BroadcastLog"> | string | null;
    mediaType?: Prisma.StringNullableFilter<"BroadcastLog"> | string | null;
    totalSent?: Prisma.IntFilter<"BroadcastLog"> | number;
    totalFailed?: Prisma.IntFilter<"BroadcastLog"> | number;
    createdAt?: Prisma.DateTimeFilter<"BroadcastLog"> | Date | string;
    createdBy?: Prisma.StringFilter<"BroadcastLog"> | string;
    adminTelegramId?: Prisma.BigIntNullableFilter<"BroadcastLog"> | bigint | number | null;
}, "id">;
export type BroadcastLogOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    type?: Prisma.SortOrder;
    target?: Prisma.SortOrder;
    messageText?: Prisma.SortOrderInput | Prisma.SortOrder;
    mediaFileId?: Prisma.SortOrderInput | Prisma.SortOrder;
    mediaType?: Prisma.SortOrderInput | Prisma.SortOrder;
    totalSent?: Prisma.SortOrder;
    totalFailed?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    createdBy?: Prisma.SortOrder;
    adminTelegramId?: Prisma.SortOrderInput | Prisma.SortOrder;
    _count?: Prisma.BroadcastLogCountOrderByAggregateInput;
    _avg?: Prisma.BroadcastLogAvgOrderByAggregateInput;
    _max?: Prisma.BroadcastLogMaxOrderByAggregateInput;
    _min?: Prisma.BroadcastLogMinOrderByAggregateInput;
    _sum?: Prisma.BroadcastLogSumOrderByAggregateInput;
};
export type BroadcastLogScalarWhereWithAggregatesInput = {
    AND?: Prisma.BroadcastLogScalarWhereWithAggregatesInput | Prisma.BroadcastLogScalarWhereWithAggregatesInput[];
    OR?: Prisma.BroadcastLogScalarWhereWithAggregatesInput[];
    NOT?: Prisma.BroadcastLogScalarWhereWithAggregatesInput | Prisma.BroadcastLogScalarWhereWithAggregatesInput[];
    id?: Prisma.IntWithAggregatesFilter<"BroadcastLog"> | number;
    type?: Prisma.StringWithAggregatesFilter<"BroadcastLog"> | string;
    target?: Prisma.StringWithAggregatesFilter<"BroadcastLog"> | string;
    messageText?: Prisma.StringNullableWithAggregatesFilter<"BroadcastLog"> | string | null;
    mediaFileId?: Prisma.StringNullableWithAggregatesFilter<"BroadcastLog"> | string | null;
    mediaType?: Prisma.StringNullableWithAggregatesFilter<"BroadcastLog"> | string | null;
    totalSent?: Prisma.IntWithAggregatesFilter<"BroadcastLog"> | number;
    totalFailed?: Prisma.IntWithAggregatesFilter<"BroadcastLog"> | number;
    createdAt?: Prisma.DateTimeWithAggregatesFilter<"BroadcastLog"> | Date | string;
    createdBy?: Prisma.StringWithAggregatesFilter<"BroadcastLog"> | string;
    adminTelegramId?: Prisma.BigIntNullableWithAggregatesFilter<"BroadcastLog"> | bigint | number | null;
};
export type BroadcastLogCreateInput = {
    type: string;
    target: string;
    messageText?: string | null;
    mediaFileId?: string | null;
    mediaType?: string | null;
    totalSent: number;
    totalFailed: number;
    createdAt?: Date | string;
    createdBy: string;
    adminTelegramId?: bigint | number | null;
};
export type BroadcastLogUncheckedCreateInput = {
    id?: number;
    type: string;
    target: string;
    messageText?: string | null;
    mediaFileId?: string | null;
    mediaType?: string | null;
    totalSent: number;
    totalFailed: number;
    createdAt?: Date | string;
    createdBy: string;
    adminTelegramId?: bigint | number | null;
};
export type BroadcastLogUpdateInput = {
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    target?: Prisma.StringFieldUpdateOperationsInput | string;
    messageText?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    mediaFileId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    mediaType?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    totalSent?: Prisma.IntFieldUpdateOperationsInput | number;
    totalFailed?: Prisma.IntFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    createdBy?: Prisma.StringFieldUpdateOperationsInput | string;
    adminTelegramId?: Prisma.NullableBigIntFieldUpdateOperationsInput | bigint | number | null;
};
export type BroadcastLogUncheckedUpdateInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    target?: Prisma.StringFieldUpdateOperationsInput | string;
    messageText?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    mediaFileId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    mediaType?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    totalSent?: Prisma.IntFieldUpdateOperationsInput | number;
    totalFailed?: Prisma.IntFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    createdBy?: Prisma.StringFieldUpdateOperationsInput | string;
    adminTelegramId?: Prisma.NullableBigIntFieldUpdateOperationsInput | bigint | number | null;
};
export type BroadcastLogCreateManyInput = {
    id?: number;
    type: string;
    target: string;
    messageText?: string | null;
    mediaFileId?: string | null;
    mediaType?: string | null;
    totalSent: number;
    totalFailed: number;
    createdAt?: Date | string;
    createdBy: string;
    adminTelegramId?: bigint | number | null;
};
export type BroadcastLogUpdateManyMutationInput = {
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    target?: Prisma.StringFieldUpdateOperationsInput | string;
    messageText?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    mediaFileId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    mediaType?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    totalSent?: Prisma.IntFieldUpdateOperationsInput | number;
    totalFailed?: Prisma.IntFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    createdBy?: Prisma.StringFieldUpdateOperationsInput | string;
    adminTelegramId?: Prisma.NullableBigIntFieldUpdateOperationsInput | bigint | number | null;
};
export type BroadcastLogUncheckedUpdateManyInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    type?: Prisma.StringFieldUpdateOperationsInput | string;
    target?: Prisma.StringFieldUpdateOperationsInput | string;
    messageText?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    mediaFileId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    mediaType?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    totalSent?: Prisma.IntFieldUpdateOperationsInput | number;
    totalFailed?: Prisma.IntFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    createdBy?: Prisma.StringFieldUpdateOperationsInput | string;
    adminTelegramId?: Prisma.NullableBigIntFieldUpdateOperationsInput | bigint | number | null;
};
export type BroadcastLogCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    type?: Prisma.SortOrder;
    target?: Prisma.SortOrder;
    messageText?: Prisma.SortOrder;
    mediaFileId?: Prisma.SortOrder;
    mediaType?: Prisma.SortOrder;
    totalSent?: Prisma.SortOrder;
    totalFailed?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    createdBy?: Prisma.SortOrder;
    adminTelegramId?: Prisma.SortOrder;
};
export type BroadcastLogAvgOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    totalSent?: Prisma.SortOrder;
    totalFailed?: Prisma.SortOrder;
    adminTelegramId?: Prisma.SortOrder;
};
export type BroadcastLogMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    type?: Prisma.SortOrder;
    target?: Prisma.SortOrder;
    messageText?: Prisma.SortOrder;
    mediaFileId?: Prisma.SortOrder;
    mediaType?: Prisma.SortOrder;
    totalSent?: Prisma.SortOrder;
    totalFailed?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    createdBy?: Prisma.SortOrder;
    adminTelegramId?: Prisma.SortOrder;
};
export type BroadcastLogMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    type?: Prisma.SortOrder;
    target?: Prisma.SortOrder;
    messageText?: Prisma.SortOrder;
    mediaFileId?: Prisma.SortOrder;
    mediaType?: Prisma.SortOrder;
    totalSent?: Prisma.SortOrder;
    totalFailed?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    createdBy?: Prisma.SortOrder;
    adminTelegramId?: Prisma.SortOrder;
};
export type BroadcastLogSumOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    totalSent?: Prisma.SortOrder;
    totalFailed?: Prisma.SortOrder;
    adminTelegramId?: Prisma.SortOrder;
};
export type NullableBigIntFieldUpdateOperationsInput = {
    set?: bigint | number | null;
    increment?: bigint | number;
    decrement?: bigint | number;
    multiply?: bigint | number;
    divide?: bigint | number;
};
export type BroadcastLogSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    type?: boolean;
    target?: boolean;
    messageText?: boolean;
    mediaFileId?: boolean;
    mediaType?: boolean;
    totalSent?: boolean;
    totalFailed?: boolean;
    createdAt?: boolean;
    createdBy?: boolean;
    adminTelegramId?: boolean;
}, ExtArgs["result"]["broadcastLog"]>;
export type BroadcastLogSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    type?: boolean;
    target?: boolean;
    messageText?: boolean;
    mediaFileId?: boolean;
    mediaType?: boolean;
    totalSent?: boolean;
    totalFailed?: boolean;
    createdAt?: boolean;
    createdBy?: boolean;
    adminTelegramId?: boolean;
}, ExtArgs["result"]["broadcastLog"]>;
export type BroadcastLogSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    type?: boolean;
    target?: boolean;
    messageText?: boolean;
    mediaFileId?: boolean;
    mediaType?: boolean;
    totalSent?: boolean;
    totalFailed?: boolean;
    createdAt?: boolean;
    createdBy?: boolean;
    adminTelegramId?: boolean;
}, ExtArgs["result"]["broadcastLog"]>;
export type BroadcastLogSelectScalar = {
    id?: boolean;
    type?: boolean;
    target?: boolean;
    messageText?: boolean;
    mediaFileId?: boolean;
    mediaType?: boolean;
    totalSent?: boolean;
    totalFailed?: boolean;
    createdAt?: boolean;
    createdBy?: boolean;
    adminTelegramId?: boolean;
};
export type BroadcastLogOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "type" | "target" | "messageText" | "mediaFileId" | "mediaType" | "totalSent" | "totalFailed" | "createdAt" | "createdBy" | "adminTelegramId", ExtArgs["result"]["broadcastLog"]>;
export type $BroadcastLogPayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "BroadcastLog";
    objects: {};
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: number;
        type: string;
        target: string;
        messageText: string | null;
        mediaFileId: string | null;
        mediaType: string | null;
        totalSent: number;
        totalFailed: number;
        createdAt: Date;
        createdBy: string;
        adminTelegramId: bigint | null;
    }, ExtArgs["result"]["broadcastLog"]>;
    composites: {};
};
export type BroadcastLogGetPayload<S extends boolean | null | undefined | BroadcastLogDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$BroadcastLogPayload, S>;
export type BroadcastLogCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<BroadcastLogFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: BroadcastLogCountAggregateInputType | true;
};
export interface BroadcastLogDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['BroadcastLog'];
        meta: {
            name: 'BroadcastLog';
        };
    };
    /**
     * Find zero or one BroadcastLog that matches the filter.
     * @param {BroadcastLogFindUniqueArgs} args - Arguments to find a BroadcastLog
     * @example
     * // Get one BroadcastLog
     * const broadcastLog = await prisma.broadcastLog.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends BroadcastLogFindUniqueArgs>(args: Prisma.SelectSubset<T, BroadcastLogFindUniqueArgs<ExtArgs>>): Prisma.Prisma__BroadcastLogClient<runtime.Types.Result.GetResult<Prisma.$BroadcastLogPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find one BroadcastLog that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {BroadcastLogFindUniqueOrThrowArgs} args - Arguments to find a BroadcastLog
     * @example
     * // Get one BroadcastLog
     * const broadcastLog = await prisma.broadcastLog.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends BroadcastLogFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, BroadcastLogFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__BroadcastLogClient<runtime.Types.Result.GetResult<Prisma.$BroadcastLogPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first BroadcastLog that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BroadcastLogFindFirstArgs} args - Arguments to find a BroadcastLog
     * @example
     * // Get one BroadcastLog
     * const broadcastLog = await prisma.broadcastLog.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends BroadcastLogFindFirstArgs>(args?: Prisma.SelectSubset<T, BroadcastLogFindFirstArgs<ExtArgs>>): Prisma.Prisma__BroadcastLogClient<runtime.Types.Result.GetResult<Prisma.$BroadcastLogPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first BroadcastLog that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BroadcastLogFindFirstOrThrowArgs} args - Arguments to find a BroadcastLog
     * @example
     * // Get one BroadcastLog
     * const broadcastLog = await prisma.broadcastLog.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends BroadcastLogFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, BroadcastLogFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__BroadcastLogClient<runtime.Types.Result.GetResult<Prisma.$BroadcastLogPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find zero or more BroadcastLogs that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BroadcastLogFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all BroadcastLogs
     * const broadcastLogs = await prisma.broadcastLog.findMany()
     *
     * // Get first 10 BroadcastLogs
     * const broadcastLogs = await prisma.broadcastLog.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const broadcastLogWithIdOnly = await prisma.broadcastLog.findMany({ select: { id: true } })
     *
     */
    findMany<T extends BroadcastLogFindManyArgs>(args?: Prisma.SelectSubset<T, BroadcastLogFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$BroadcastLogPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    /**
     * Create a BroadcastLog.
     * @param {BroadcastLogCreateArgs} args - Arguments to create a BroadcastLog.
     * @example
     * // Create one BroadcastLog
     * const BroadcastLog = await prisma.broadcastLog.create({
     *   data: {
     *     // ... data to create a BroadcastLog
     *   }
     * })
     *
     */
    create<T extends BroadcastLogCreateArgs>(args: Prisma.SelectSubset<T, BroadcastLogCreateArgs<ExtArgs>>): Prisma.Prisma__BroadcastLogClient<runtime.Types.Result.GetResult<Prisma.$BroadcastLogPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Create many BroadcastLogs.
     * @param {BroadcastLogCreateManyArgs} args - Arguments to create many BroadcastLogs.
     * @example
     * // Create many BroadcastLogs
     * const broadcastLog = await prisma.broadcastLog.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends BroadcastLogCreateManyArgs>(args?: Prisma.SelectSubset<T, BroadcastLogCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Create many BroadcastLogs and returns the data saved in the database.
     * @param {BroadcastLogCreateManyAndReturnArgs} args - Arguments to create many BroadcastLogs.
     * @example
     * // Create many BroadcastLogs
     * const broadcastLog = await prisma.broadcastLog.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many BroadcastLogs and only return the `id`
     * const broadcastLogWithIdOnly = await prisma.broadcastLog.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends BroadcastLogCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, BroadcastLogCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$BroadcastLogPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    /**
     * Delete a BroadcastLog.
     * @param {BroadcastLogDeleteArgs} args - Arguments to delete one BroadcastLog.
     * @example
     * // Delete one BroadcastLog
     * const BroadcastLog = await prisma.broadcastLog.delete({
     *   where: {
     *     // ... filter to delete one BroadcastLog
     *   }
     * })
     *
     */
    delete<T extends BroadcastLogDeleteArgs>(args: Prisma.SelectSubset<T, BroadcastLogDeleteArgs<ExtArgs>>): Prisma.Prisma__BroadcastLogClient<runtime.Types.Result.GetResult<Prisma.$BroadcastLogPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Update one BroadcastLog.
     * @param {BroadcastLogUpdateArgs} args - Arguments to update one BroadcastLog.
     * @example
     * // Update one BroadcastLog
     * const broadcastLog = await prisma.broadcastLog.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends BroadcastLogUpdateArgs>(args: Prisma.SelectSubset<T, BroadcastLogUpdateArgs<ExtArgs>>): Prisma.Prisma__BroadcastLogClient<runtime.Types.Result.GetResult<Prisma.$BroadcastLogPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Delete zero or more BroadcastLogs.
     * @param {BroadcastLogDeleteManyArgs} args - Arguments to filter BroadcastLogs to delete.
     * @example
     * // Delete a few BroadcastLogs
     * const { count } = await prisma.broadcastLog.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends BroadcastLogDeleteManyArgs>(args?: Prisma.SelectSubset<T, BroadcastLogDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more BroadcastLogs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BroadcastLogUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many BroadcastLogs
     * const broadcastLog = await prisma.broadcastLog.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends BroadcastLogUpdateManyArgs>(args: Prisma.SelectSubset<T, BroadcastLogUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more BroadcastLogs and returns the data updated in the database.
     * @param {BroadcastLogUpdateManyAndReturnArgs} args - Arguments to update many BroadcastLogs.
     * @example
     * // Update many BroadcastLogs
     * const broadcastLog = await prisma.broadcastLog.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more BroadcastLogs and only return the `id`
     * const broadcastLogWithIdOnly = await prisma.broadcastLog.updateManyAndReturn({
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
    updateManyAndReturn<T extends BroadcastLogUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, BroadcastLogUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$BroadcastLogPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    /**
     * Create or update one BroadcastLog.
     * @param {BroadcastLogUpsertArgs} args - Arguments to update or create a BroadcastLog.
     * @example
     * // Update or create a BroadcastLog
     * const broadcastLog = await prisma.broadcastLog.upsert({
     *   create: {
     *     // ... data to create a BroadcastLog
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the BroadcastLog we want to update
     *   }
     * })
     */
    upsert<T extends BroadcastLogUpsertArgs>(args: Prisma.SelectSubset<T, BroadcastLogUpsertArgs<ExtArgs>>): Prisma.Prisma__BroadcastLogClient<runtime.Types.Result.GetResult<Prisma.$BroadcastLogPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Count the number of BroadcastLogs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BroadcastLogCountArgs} args - Arguments to filter BroadcastLogs to count.
     * @example
     * // Count the number of BroadcastLogs
     * const count = await prisma.broadcastLog.count({
     *   where: {
     *     // ... the filter for the BroadcastLogs we want to count
     *   }
     * })
    **/
    count<T extends BroadcastLogCountArgs>(args?: Prisma.Subset<T, BroadcastLogCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], BroadcastLogCountAggregateOutputType> : number>;
    /**
     * Allows you to perform aggregations operations on a BroadcastLog.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BroadcastLogAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends BroadcastLogAggregateArgs>(args: Prisma.Subset<T, BroadcastLogAggregateArgs>): Prisma.PrismaPromise<GetBroadcastLogAggregateType<T>>;
    /**
     * Group by BroadcastLog.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BroadcastLogGroupByArgs} args - Group by arguments.
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
    groupBy<T extends BroadcastLogGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: BroadcastLogGroupByArgs['orderBy'];
    } : {
        orderBy?: BroadcastLogGroupByArgs['orderBy'];
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
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, BroadcastLogGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetBroadcastLogGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the BroadcastLog model
     */
    readonly fields: BroadcastLogFieldRefs;
}
/**
 * The delegate class that acts as a "Promise-like" for BroadcastLog.
 * Why is this prefixed with `Prisma__`?
 * Because we want to prevent naming conflicts as mentioned in
 * https://github.com/prisma/prisma-client-js/issues/707
 */
export interface Prisma__BroadcastLogClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
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
 * Fields of the BroadcastLog model
 */
export interface BroadcastLogFieldRefs {
    readonly id: Prisma.FieldRef<"BroadcastLog", 'Int'>;
    readonly type: Prisma.FieldRef<"BroadcastLog", 'String'>;
    readonly target: Prisma.FieldRef<"BroadcastLog", 'String'>;
    readonly messageText: Prisma.FieldRef<"BroadcastLog", 'String'>;
    readonly mediaFileId: Prisma.FieldRef<"BroadcastLog", 'String'>;
    readonly mediaType: Prisma.FieldRef<"BroadcastLog", 'String'>;
    readonly totalSent: Prisma.FieldRef<"BroadcastLog", 'Int'>;
    readonly totalFailed: Prisma.FieldRef<"BroadcastLog", 'Int'>;
    readonly createdAt: Prisma.FieldRef<"BroadcastLog", 'DateTime'>;
    readonly createdBy: Prisma.FieldRef<"BroadcastLog", 'String'>;
    readonly adminTelegramId: Prisma.FieldRef<"BroadcastLog", 'BigInt'>;
}
/**
 * BroadcastLog findUnique
 */
export type BroadcastLogFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BroadcastLog
     */
    select?: Prisma.BroadcastLogSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the BroadcastLog
     */
    omit?: Prisma.BroadcastLogOmit<ExtArgs> | null;
    /**
     * Filter, which BroadcastLog to fetch.
     */
    where: Prisma.BroadcastLogWhereUniqueInput;
};
/**
 * BroadcastLog findUniqueOrThrow
 */
export type BroadcastLogFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BroadcastLog
     */
    select?: Prisma.BroadcastLogSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the BroadcastLog
     */
    omit?: Prisma.BroadcastLogOmit<ExtArgs> | null;
    /**
     * Filter, which BroadcastLog to fetch.
     */
    where: Prisma.BroadcastLogWhereUniqueInput;
};
/**
 * BroadcastLog findFirst
 */
export type BroadcastLogFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BroadcastLog
     */
    select?: Prisma.BroadcastLogSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the BroadcastLog
     */
    omit?: Prisma.BroadcastLogOmit<ExtArgs> | null;
    /**
     * Filter, which BroadcastLog to fetch.
     */
    where?: Prisma.BroadcastLogWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of BroadcastLogs to fetch.
     */
    orderBy?: Prisma.BroadcastLogOrderByWithRelationInput | Prisma.BroadcastLogOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for BroadcastLogs.
     */
    cursor?: Prisma.BroadcastLogWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` BroadcastLogs from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` BroadcastLogs.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of BroadcastLogs.
     */
    distinct?: Prisma.BroadcastLogScalarFieldEnum | Prisma.BroadcastLogScalarFieldEnum[];
};
/**
 * BroadcastLog findFirstOrThrow
 */
export type BroadcastLogFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BroadcastLog
     */
    select?: Prisma.BroadcastLogSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the BroadcastLog
     */
    omit?: Prisma.BroadcastLogOmit<ExtArgs> | null;
    /**
     * Filter, which BroadcastLog to fetch.
     */
    where?: Prisma.BroadcastLogWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of BroadcastLogs to fetch.
     */
    orderBy?: Prisma.BroadcastLogOrderByWithRelationInput | Prisma.BroadcastLogOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for BroadcastLogs.
     */
    cursor?: Prisma.BroadcastLogWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` BroadcastLogs from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` BroadcastLogs.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of BroadcastLogs.
     */
    distinct?: Prisma.BroadcastLogScalarFieldEnum | Prisma.BroadcastLogScalarFieldEnum[];
};
/**
 * BroadcastLog findMany
 */
export type BroadcastLogFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BroadcastLog
     */
    select?: Prisma.BroadcastLogSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the BroadcastLog
     */
    omit?: Prisma.BroadcastLogOmit<ExtArgs> | null;
    /**
     * Filter, which BroadcastLogs to fetch.
     */
    where?: Prisma.BroadcastLogWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of BroadcastLogs to fetch.
     */
    orderBy?: Prisma.BroadcastLogOrderByWithRelationInput | Prisma.BroadcastLogOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing BroadcastLogs.
     */
    cursor?: Prisma.BroadcastLogWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` BroadcastLogs from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` BroadcastLogs.
     */
    skip?: number;
    distinct?: Prisma.BroadcastLogScalarFieldEnum | Prisma.BroadcastLogScalarFieldEnum[];
};
/**
 * BroadcastLog create
 */
export type BroadcastLogCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BroadcastLog
     */
    select?: Prisma.BroadcastLogSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the BroadcastLog
     */
    omit?: Prisma.BroadcastLogOmit<ExtArgs> | null;
    /**
     * The data needed to create a BroadcastLog.
     */
    data: Prisma.XOR<Prisma.BroadcastLogCreateInput, Prisma.BroadcastLogUncheckedCreateInput>;
};
/**
 * BroadcastLog createMany
 */
export type BroadcastLogCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to create many BroadcastLogs.
     */
    data: Prisma.BroadcastLogCreateManyInput | Prisma.BroadcastLogCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * BroadcastLog createManyAndReturn
 */
export type BroadcastLogCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BroadcastLog
     */
    select?: Prisma.BroadcastLogSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the BroadcastLog
     */
    omit?: Prisma.BroadcastLogOmit<ExtArgs> | null;
    /**
     * The data used to create many BroadcastLogs.
     */
    data: Prisma.BroadcastLogCreateManyInput | Prisma.BroadcastLogCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * BroadcastLog update
 */
export type BroadcastLogUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BroadcastLog
     */
    select?: Prisma.BroadcastLogSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the BroadcastLog
     */
    omit?: Prisma.BroadcastLogOmit<ExtArgs> | null;
    /**
     * The data needed to update a BroadcastLog.
     */
    data: Prisma.XOR<Prisma.BroadcastLogUpdateInput, Prisma.BroadcastLogUncheckedUpdateInput>;
    /**
     * Choose, which BroadcastLog to update.
     */
    where: Prisma.BroadcastLogWhereUniqueInput;
};
/**
 * BroadcastLog updateMany
 */
export type BroadcastLogUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to update BroadcastLogs.
     */
    data: Prisma.XOR<Prisma.BroadcastLogUpdateManyMutationInput, Prisma.BroadcastLogUncheckedUpdateManyInput>;
    /**
     * Filter which BroadcastLogs to update
     */
    where?: Prisma.BroadcastLogWhereInput;
    /**
     * Limit how many BroadcastLogs to update.
     */
    limit?: number;
};
/**
 * BroadcastLog updateManyAndReturn
 */
export type BroadcastLogUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BroadcastLog
     */
    select?: Prisma.BroadcastLogSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the BroadcastLog
     */
    omit?: Prisma.BroadcastLogOmit<ExtArgs> | null;
    /**
     * The data used to update BroadcastLogs.
     */
    data: Prisma.XOR<Prisma.BroadcastLogUpdateManyMutationInput, Prisma.BroadcastLogUncheckedUpdateManyInput>;
    /**
     * Filter which BroadcastLogs to update
     */
    where?: Prisma.BroadcastLogWhereInput;
    /**
     * Limit how many BroadcastLogs to update.
     */
    limit?: number;
};
/**
 * BroadcastLog upsert
 */
export type BroadcastLogUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BroadcastLog
     */
    select?: Prisma.BroadcastLogSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the BroadcastLog
     */
    omit?: Prisma.BroadcastLogOmit<ExtArgs> | null;
    /**
     * The filter to search for the BroadcastLog to update in case it exists.
     */
    where: Prisma.BroadcastLogWhereUniqueInput;
    /**
     * In case the BroadcastLog found by the `where` argument doesn't exist, create a new BroadcastLog with this data.
     */
    create: Prisma.XOR<Prisma.BroadcastLogCreateInput, Prisma.BroadcastLogUncheckedCreateInput>;
    /**
     * In case the BroadcastLog was found with the provided `where` argument, update it with this data.
     */
    update: Prisma.XOR<Prisma.BroadcastLogUpdateInput, Prisma.BroadcastLogUncheckedUpdateInput>;
};
/**
 * BroadcastLog delete
 */
export type BroadcastLogDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BroadcastLog
     */
    select?: Prisma.BroadcastLogSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the BroadcastLog
     */
    omit?: Prisma.BroadcastLogOmit<ExtArgs> | null;
    /**
     * Filter which BroadcastLog to delete.
     */
    where: Prisma.BroadcastLogWhereUniqueInput;
};
/**
 * BroadcastLog deleteMany
 */
export type BroadcastLogDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which BroadcastLogs to delete
     */
    where?: Prisma.BroadcastLogWhereInput;
    /**
     * Limit how many BroadcastLogs to delete.
     */
    limit?: number;
};
/**
 * BroadcastLog without action
 */
export type BroadcastLogDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the BroadcastLog
     */
    select?: Prisma.BroadcastLogSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the BroadcastLog
     */
    omit?: Prisma.BroadcastLogOmit<ExtArgs> | null;
};
export {};
//# sourceMappingURL=BroadcastLog.d.ts.map