import type * as runtime from "@prisma/client/runtime/client";
import type * as $Enums from "../enums";
import type * as Prisma from "../internal/prismaNamespace";
/**
 * Model Client
 *
 */
export type ClientModel = runtime.Types.Result.DefaultSelection<Prisma.$ClientPayload>;
export type AggregateClient = {
    _count: ClientCountAggregateOutputType | null;
    _avg: ClientAvgAggregateOutputType | null;
    _sum: ClientSumAggregateOutputType | null;
    _min: ClientMinAggregateOutputType | null;
    _max: ClientMaxAggregateOutputType | null;
};
export type ClientAvgAggregateOutputType = {
    id: number | null;
    segmentId: number | null;
    telegramTopicId: number | null;
    pinnedMessageId: number | null;
    totalPurchases: number | null;
    totalRevenue: runtime.Decimal | null;
};
export type ClientSumAggregateOutputType = {
    id: number | null;
    segmentId: number | null;
    telegramTopicId: number | null;
    pinnedMessageId: number | null;
    totalPurchases: number | null;
    totalRevenue: runtime.Decimal | null;
};
export type ClientMinAggregateOutputType = {
    id: number | null;
    name: string | null;
    source: $Enums.ClientSource | null;
    externalId: string | null;
    segmentId: number | null;
    notes: string | null;
    telegramTopicId: number | null;
    pinnedMessageId: number | null;
    phone: string | null;
    fullName: string | null;
    email: string | null;
    birthDate: Date | null;
    lastPurchaseDate: Date | null;
    totalPurchases: number | null;
    totalRevenue: runtime.Decimal | null;
    createdAt: Date | null;
    updatedAt: Date | null;
};
export type ClientMaxAggregateOutputType = {
    id: number | null;
    name: string | null;
    source: $Enums.ClientSource | null;
    externalId: string | null;
    segmentId: number | null;
    notes: string | null;
    telegramTopicId: number | null;
    pinnedMessageId: number | null;
    phone: string | null;
    fullName: string | null;
    email: string | null;
    birthDate: Date | null;
    lastPurchaseDate: Date | null;
    totalPurchases: number | null;
    totalRevenue: runtime.Decimal | null;
    createdAt: Date | null;
    updatedAt: Date | null;
};
export type ClientCountAggregateOutputType = {
    id: number;
    name: number;
    source: number;
    externalId: number;
    segmentId: number;
    notes: number;
    telegramTopicId: number;
    pinnedMessageId: number;
    phone: number;
    fullName: number;
    email: number;
    birthDate: number;
    lastPurchaseDate: number;
    totalPurchases: number;
    totalRevenue: number;
    createdAt: number;
    updatedAt: number;
    _all: number;
};
export type ClientAvgAggregateInputType = {
    id?: true;
    segmentId?: true;
    telegramTopicId?: true;
    pinnedMessageId?: true;
    totalPurchases?: true;
    totalRevenue?: true;
};
export type ClientSumAggregateInputType = {
    id?: true;
    segmentId?: true;
    telegramTopicId?: true;
    pinnedMessageId?: true;
    totalPurchases?: true;
    totalRevenue?: true;
};
export type ClientMinAggregateInputType = {
    id?: true;
    name?: true;
    source?: true;
    externalId?: true;
    segmentId?: true;
    notes?: true;
    telegramTopicId?: true;
    pinnedMessageId?: true;
    phone?: true;
    fullName?: true;
    email?: true;
    birthDate?: true;
    lastPurchaseDate?: true;
    totalPurchases?: true;
    totalRevenue?: true;
    createdAt?: true;
    updatedAt?: true;
};
export type ClientMaxAggregateInputType = {
    id?: true;
    name?: true;
    source?: true;
    externalId?: true;
    segmentId?: true;
    notes?: true;
    telegramTopicId?: true;
    pinnedMessageId?: true;
    phone?: true;
    fullName?: true;
    email?: true;
    birthDate?: true;
    lastPurchaseDate?: true;
    totalPurchases?: true;
    totalRevenue?: true;
    createdAt?: true;
    updatedAt?: true;
};
export type ClientCountAggregateInputType = {
    id?: true;
    name?: true;
    source?: true;
    externalId?: true;
    segmentId?: true;
    notes?: true;
    telegramTopicId?: true;
    pinnedMessageId?: true;
    phone?: true;
    fullName?: true;
    email?: true;
    birthDate?: true;
    lastPurchaseDate?: true;
    totalPurchases?: true;
    totalRevenue?: true;
    createdAt?: true;
    updatedAt?: true;
    _all?: true;
};
export type ClientAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which Client to aggregate.
     */
    where?: Prisma.ClientWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Clients to fetch.
     */
    orderBy?: Prisma.ClientOrderByWithRelationInput | Prisma.ClientOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: Prisma.ClientWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Clients from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Clients.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned Clients
    **/
    _count?: true | ClientCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to average
    **/
    _avg?: ClientAvgAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to sum
    **/
    _sum?: ClientSumAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
    **/
    _min?: ClientMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
    **/
    _max?: ClientMaxAggregateInputType;
};
export type GetClientAggregateType<T extends ClientAggregateArgs> = {
    [P in keyof T & keyof AggregateClient]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateClient[P]> : Prisma.GetScalarType<T[P], AggregateClient[P]>;
};
export type ClientGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.ClientWhereInput;
    orderBy?: Prisma.ClientOrderByWithAggregationInput | Prisma.ClientOrderByWithAggregationInput[];
    by: Prisma.ClientScalarFieldEnum[] | Prisma.ClientScalarFieldEnum;
    having?: Prisma.ClientScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: ClientCountAggregateInputType | true;
    _avg?: ClientAvgAggregateInputType;
    _sum?: ClientSumAggregateInputType;
    _min?: ClientMinAggregateInputType;
    _max?: ClientMaxAggregateInputType;
};
export type ClientGroupByOutputType = {
    id: number;
    name: string;
    source: $Enums.ClientSource;
    externalId: string | null;
    segmentId: number | null;
    notes: string | null;
    telegramTopicId: number | null;
    pinnedMessageId: number | null;
    phone: string | null;
    fullName: string | null;
    email: string | null;
    birthDate: Date | null;
    lastPurchaseDate: Date | null;
    totalPurchases: number;
    totalRevenue: runtime.Decimal;
    createdAt: Date;
    updatedAt: Date;
    _count: ClientCountAggregateOutputType | null;
    _avg: ClientAvgAggregateOutputType | null;
    _sum: ClientSumAggregateOutputType | null;
    _min: ClientMinAggregateOutputType | null;
    _max: ClientMaxAggregateOutputType | null;
};
type GetClientGroupByPayload<T extends ClientGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<ClientGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof ClientGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], ClientGroupByOutputType[P]> : Prisma.GetScalarType<T[P], ClientGroupByOutputType[P]>;
}>>;
export type ClientWhereInput = {
    AND?: Prisma.ClientWhereInput | Prisma.ClientWhereInput[];
    OR?: Prisma.ClientWhereInput[];
    NOT?: Prisma.ClientWhereInput | Prisma.ClientWhereInput[];
    id?: Prisma.IntFilter<"Client"> | number;
    name?: Prisma.StringFilter<"Client"> | string;
    source?: Prisma.EnumClientSourceFilter<"Client"> | $Enums.ClientSource;
    externalId?: Prisma.StringNullableFilter<"Client"> | string | null;
    segmentId?: Prisma.IntNullableFilter<"Client"> | number | null;
    notes?: Prisma.StringNullableFilter<"Client"> | string | null;
    telegramTopicId?: Prisma.IntNullableFilter<"Client"> | number | null;
    pinnedMessageId?: Prisma.IntNullableFilter<"Client"> | number | null;
    phone?: Prisma.StringNullableFilter<"Client"> | string | null;
    fullName?: Prisma.StringNullableFilter<"Client"> | string | null;
    email?: Prisma.StringNullableFilter<"Client"> | string | null;
    birthDate?: Prisma.DateTimeNullableFilter<"Client"> | Date | string | null;
    lastPurchaseDate?: Prisma.DateTimeNullableFilter<"Client"> | Date | string | null;
    totalPurchases?: Prisma.IntFilter<"Client"> | number;
    totalRevenue?: Prisma.DecimalFilter<"Client"> | runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Prisma.DateTimeFilter<"Client"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"Client"> | Date | string;
    segment?: Prisma.XOR<Prisma.SegmentNullableScalarRelationFilter, Prisma.SegmentWhereInput> | null;
    messages?: Prisma.MessageListRelationFilter;
    tags?: Prisma.TagListRelationFilter;
    tasks?: Prisma.TaskListRelationFilter;
    orders?: Prisma.OrderListRelationFilter;
    reservations?: Prisma.ReservationListRelationFilter;
};
export type ClientOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    source?: Prisma.SortOrder;
    externalId?: Prisma.SortOrderInput | Prisma.SortOrder;
    segmentId?: Prisma.SortOrderInput | Prisma.SortOrder;
    notes?: Prisma.SortOrderInput | Prisma.SortOrder;
    telegramTopicId?: Prisma.SortOrderInput | Prisma.SortOrder;
    pinnedMessageId?: Prisma.SortOrderInput | Prisma.SortOrder;
    phone?: Prisma.SortOrderInput | Prisma.SortOrder;
    fullName?: Prisma.SortOrderInput | Prisma.SortOrder;
    email?: Prisma.SortOrderInput | Prisma.SortOrder;
    birthDate?: Prisma.SortOrderInput | Prisma.SortOrder;
    lastPurchaseDate?: Prisma.SortOrderInput | Prisma.SortOrder;
    totalPurchases?: Prisma.SortOrder;
    totalRevenue?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    segment?: Prisma.SegmentOrderByWithRelationInput;
    messages?: Prisma.MessageOrderByRelationAggregateInput;
    tags?: Prisma.TagOrderByRelationAggregateInput;
    tasks?: Prisma.TaskOrderByRelationAggregateInput;
    orders?: Prisma.OrderOrderByRelationAggregateInput;
    reservations?: Prisma.ReservationOrderByRelationAggregateInput;
};
export type ClientWhereUniqueInput = Prisma.AtLeast<{
    id?: number;
    source_externalId?: Prisma.ClientSourceExternalIdCompoundUniqueInput;
    AND?: Prisma.ClientWhereInput | Prisma.ClientWhereInput[];
    OR?: Prisma.ClientWhereInput[];
    NOT?: Prisma.ClientWhereInput | Prisma.ClientWhereInput[];
    name?: Prisma.StringFilter<"Client"> | string;
    source?: Prisma.EnumClientSourceFilter<"Client"> | $Enums.ClientSource;
    externalId?: Prisma.StringNullableFilter<"Client"> | string | null;
    segmentId?: Prisma.IntNullableFilter<"Client"> | number | null;
    notes?: Prisma.StringNullableFilter<"Client"> | string | null;
    telegramTopicId?: Prisma.IntNullableFilter<"Client"> | number | null;
    pinnedMessageId?: Prisma.IntNullableFilter<"Client"> | number | null;
    phone?: Prisma.StringNullableFilter<"Client"> | string | null;
    fullName?: Prisma.StringNullableFilter<"Client"> | string | null;
    email?: Prisma.StringNullableFilter<"Client"> | string | null;
    birthDate?: Prisma.DateTimeNullableFilter<"Client"> | Date | string | null;
    lastPurchaseDate?: Prisma.DateTimeNullableFilter<"Client"> | Date | string | null;
    totalPurchases?: Prisma.IntFilter<"Client"> | number;
    totalRevenue?: Prisma.DecimalFilter<"Client"> | runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Prisma.DateTimeFilter<"Client"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"Client"> | Date | string;
    segment?: Prisma.XOR<Prisma.SegmentNullableScalarRelationFilter, Prisma.SegmentWhereInput> | null;
    messages?: Prisma.MessageListRelationFilter;
    tags?: Prisma.TagListRelationFilter;
    tasks?: Prisma.TaskListRelationFilter;
    orders?: Prisma.OrderListRelationFilter;
    reservations?: Prisma.ReservationListRelationFilter;
}, "id" | "source_externalId">;
export type ClientOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    source?: Prisma.SortOrder;
    externalId?: Prisma.SortOrderInput | Prisma.SortOrder;
    segmentId?: Prisma.SortOrderInput | Prisma.SortOrder;
    notes?: Prisma.SortOrderInput | Prisma.SortOrder;
    telegramTopicId?: Prisma.SortOrderInput | Prisma.SortOrder;
    pinnedMessageId?: Prisma.SortOrderInput | Prisma.SortOrder;
    phone?: Prisma.SortOrderInput | Prisma.SortOrder;
    fullName?: Prisma.SortOrderInput | Prisma.SortOrder;
    email?: Prisma.SortOrderInput | Prisma.SortOrder;
    birthDate?: Prisma.SortOrderInput | Prisma.SortOrder;
    lastPurchaseDate?: Prisma.SortOrderInput | Prisma.SortOrder;
    totalPurchases?: Prisma.SortOrder;
    totalRevenue?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    _count?: Prisma.ClientCountOrderByAggregateInput;
    _avg?: Prisma.ClientAvgOrderByAggregateInput;
    _max?: Prisma.ClientMaxOrderByAggregateInput;
    _min?: Prisma.ClientMinOrderByAggregateInput;
    _sum?: Prisma.ClientSumOrderByAggregateInput;
};
export type ClientScalarWhereWithAggregatesInput = {
    AND?: Prisma.ClientScalarWhereWithAggregatesInput | Prisma.ClientScalarWhereWithAggregatesInput[];
    OR?: Prisma.ClientScalarWhereWithAggregatesInput[];
    NOT?: Prisma.ClientScalarWhereWithAggregatesInput | Prisma.ClientScalarWhereWithAggregatesInput[];
    id?: Prisma.IntWithAggregatesFilter<"Client"> | number;
    name?: Prisma.StringWithAggregatesFilter<"Client"> | string;
    source?: Prisma.EnumClientSourceWithAggregatesFilter<"Client"> | $Enums.ClientSource;
    externalId?: Prisma.StringNullableWithAggregatesFilter<"Client"> | string | null;
    segmentId?: Prisma.IntNullableWithAggregatesFilter<"Client"> | number | null;
    notes?: Prisma.StringNullableWithAggregatesFilter<"Client"> | string | null;
    telegramTopicId?: Prisma.IntNullableWithAggregatesFilter<"Client"> | number | null;
    pinnedMessageId?: Prisma.IntNullableWithAggregatesFilter<"Client"> | number | null;
    phone?: Prisma.StringNullableWithAggregatesFilter<"Client"> | string | null;
    fullName?: Prisma.StringNullableWithAggregatesFilter<"Client"> | string | null;
    email?: Prisma.StringNullableWithAggregatesFilter<"Client"> | string | null;
    birthDate?: Prisma.DateTimeNullableWithAggregatesFilter<"Client"> | Date | string | null;
    lastPurchaseDate?: Prisma.DateTimeNullableWithAggregatesFilter<"Client"> | Date | string | null;
    totalPurchases?: Prisma.IntWithAggregatesFilter<"Client"> | number;
    totalRevenue?: Prisma.DecimalWithAggregatesFilter<"Client"> | runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Prisma.DateTimeWithAggregatesFilter<"Client"> | Date | string;
    updatedAt?: Prisma.DateTimeWithAggregatesFilter<"Client"> | Date | string;
};
export type ClientCreateInput = {
    name: string;
    source: $Enums.ClientSource;
    externalId?: string | null;
    notes?: string | null;
    telegramTopicId?: number | null;
    pinnedMessageId?: number | null;
    phone?: string | null;
    fullName?: string | null;
    email?: string | null;
    birthDate?: Date | string | null;
    lastPurchaseDate?: Date | string | null;
    totalPurchases?: number;
    totalRevenue?: runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    segment?: Prisma.SegmentCreateNestedOneWithoutClientsInput;
    messages?: Prisma.MessageCreateNestedManyWithoutClientInput;
    tags?: Prisma.TagCreateNestedManyWithoutClientInput;
    tasks?: Prisma.TaskCreateNestedManyWithoutClientInput;
    orders?: Prisma.OrderCreateNestedManyWithoutClientInput;
    reservations?: Prisma.ReservationCreateNestedManyWithoutClientInput;
};
export type ClientUncheckedCreateInput = {
    id?: number;
    name: string;
    source: $Enums.ClientSource;
    externalId?: string | null;
    segmentId?: number | null;
    notes?: string | null;
    telegramTopicId?: number | null;
    pinnedMessageId?: number | null;
    phone?: string | null;
    fullName?: string | null;
    email?: string | null;
    birthDate?: Date | string | null;
    lastPurchaseDate?: Date | string | null;
    totalPurchases?: number;
    totalRevenue?: runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    messages?: Prisma.MessageUncheckedCreateNestedManyWithoutClientInput;
    tags?: Prisma.TagUncheckedCreateNestedManyWithoutClientInput;
    tasks?: Prisma.TaskUncheckedCreateNestedManyWithoutClientInput;
    orders?: Prisma.OrderUncheckedCreateNestedManyWithoutClientInput;
    reservations?: Prisma.ReservationUncheckedCreateNestedManyWithoutClientInput;
};
export type ClientUpdateInput = {
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    source?: Prisma.EnumClientSourceFieldUpdateOperationsInput | $Enums.ClientSource;
    externalId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    notes?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    telegramTopicId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    pinnedMessageId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    phone?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    fullName?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    email?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    birthDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    lastPurchaseDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    totalPurchases?: Prisma.IntFieldUpdateOperationsInput | number;
    totalRevenue?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    segment?: Prisma.SegmentUpdateOneWithoutClientsNestedInput;
    messages?: Prisma.MessageUpdateManyWithoutClientNestedInput;
    tags?: Prisma.TagUpdateManyWithoutClientNestedInput;
    tasks?: Prisma.TaskUpdateManyWithoutClientNestedInput;
    orders?: Prisma.OrderUpdateManyWithoutClientNestedInput;
    reservations?: Prisma.ReservationUpdateManyWithoutClientNestedInput;
};
export type ClientUncheckedUpdateInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    source?: Prisma.EnumClientSourceFieldUpdateOperationsInput | $Enums.ClientSource;
    externalId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    segmentId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    notes?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    telegramTopicId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    pinnedMessageId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    phone?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    fullName?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    email?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    birthDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    lastPurchaseDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    totalPurchases?: Prisma.IntFieldUpdateOperationsInput | number;
    totalRevenue?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    messages?: Prisma.MessageUncheckedUpdateManyWithoutClientNestedInput;
    tags?: Prisma.TagUncheckedUpdateManyWithoutClientNestedInput;
    tasks?: Prisma.TaskUncheckedUpdateManyWithoutClientNestedInput;
    orders?: Prisma.OrderUncheckedUpdateManyWithoutClientNestedInput;
    reservations?: Prisma.ReservationUncheckedUpdateManyWithoutClientNestedInput;
};
export type ClientCreateManyInput = {
    id?: number;
    name: string;
    source: $Enums.ClientSource;
    externalId?: string | null;
    segmentId?: number | null;
    notes?: string | null;
    telegramTopicId?: number | null;
    pinnedMessageId?: number | null;
    phone?: string | null;
    fullName?: string | null;
    email?: string | null;
    birthDate?: Date | string | null;
    lastPurchaseDate?: Date | string | null;
    totalPurchases?: number;
    totalRevenue?: runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type ClientUpdateManyMutationInput = {
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    source?: Prisma.EnumClientSourceFieldUpdateOperationsInput | $Enums.ClientSource;
    externalId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    notes?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    telegramTopicId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    pinnedMessageId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    phone?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    fullName?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    email?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    birthDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    lastPurchaseDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    totalPurchases?: Prisma.IntFieldUpdateOperationsInput | number;
    totalRevenue?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type ClientUncheckedUpdateManyInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    source?: Prisma.EnumClientSourceFieldUpdateOperationsInput | $Enums.ClientSource;
    externalId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    segmentId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    notes?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    telegramTopicId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    pinnedMessageId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    phone?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    fullName?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    email?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    birthDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    lastPurchaseDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    totalPurchases?: Prisma.IntFieldUpdateOperationsInput | number;
    totalRevenue?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type ClientListRelationFilter = {
    every?: Prisma.ClientWhereInput;
    some?: Prisma.ClientWhereInput;
    none?: Prisma.ClientWhereInput;
};
export type ClientOrderByRelationAggregateInput = {
    _count?: Prisma.SortOrder;
};
export type ClientSourceExternalIdCompoundUniqueInput = {
    source: $Enums.ClientSource;
    externalId: string;
};
export type ClientCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    source?: Prisma.SortOrder;
    externalId?: Prisma.SortOrder;
    segmentId?: Prisma.SortOrder;
    notes?: Prisma.SortOrder;
    telegramTopicId?: Prisma.SortOrder;
    pinnedMessageId?: Prisma.SortOrder;
    phone?: Prisma.SortOrder;
    fullName?: Prisma.SortOrder;
    email?: Prisma.SortOrder;
    birthDate?: Prisma.SortOrder;
    lastPurchaseDate?: Prisma.SortOrder;
    totalPurchases?: Prisma.SortOrder;
    totalRevenue?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type ClientAvgOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    segmentId?: Prisma.SortOrder;
    telegramTopicId?: Prisma.SortOrder;
    pinnedMessageId?: Prisma.SortOrder;
    totalPurchases?: Prisma.SortOrder;
    totalRevenue?: Prisma.SortOrder;
};
export type ClientMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    source?: Prisma.SortOrder;
    externalId?: Prisma.SortOrder;
    segmentId?: Prisma.SortOrder;
    notes?: Prisma.SortOrder;
    telegramTopicId?: Prisma.SortOrder;
    pinnedMessageId?: Prisma.SortOrder;
    phone?: Prisma.SortOrder;
    fullName?: Prisma.SortOrder;
    email?: Prisma.SortOrder;
    birthDate?: Prisma.SortOrder;
    lastPurchaseDate?: Prisma.SortOrder;
    totalPurchases?: Prisma.SortOrder;
    totalRevenue?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type ClientMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    name?: Prisma.SortOrder;
    source?: Prisma.SortOrder;
    externalId?: Prisma.SortOrder;
    segmentId?: Prisma.SortOrder;
    notes?: Prisma.SortOrder;
    telegramTopicId?: Prisma.SortOrder;
    pinnedMessageId?: Prisma.SortOrder;
    phone?: Prisma.SortOrder;
    fullName?: Prisma.SortOrder;
    email?: Prisma.SortOrder;
    birthDate?: Prisma.SortOrder;
    lastPurchaseDate?: Prisma.SortOrder;
    totalPurchases?: Prisma.SortOrder;
    totalRevenue?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type ClientSumOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    segmentId?: Prisma.SortOrder;
    telegramTopicId?: Prisma.SortOrder;
    pinnedMessageId?: Prisma.SortOrder;
    totalPurchases?: Prisma.SortOrder;
    totalRevenue?: Prisma.SortOrder;
};
export type ClientScalarRelationFilter = {
    is?: Prisma.ClientWhereInput;
    isNot?: Prisma.ClientWhereInput;
};
export type ClientNullableScalarRelationFilter = {
    is?: Prisma.ClientWhereInput | null;
    isNot?: Prisma.ClientWhereInput | null;
};
export type ClientCreateNestedManyWithoutSegmentInput = {
    create?: Prisma.XOR<Prisma.ClientCreateWithoutSegmentInput, Prisma.ClientUncheckedCreateWithoutSegmentInput> | Prisma.ClientCreateWithoutSegmentInput[] | Prisma.ClientUncheckedCreateWithoutSegmentInput[];
    connectOrCreate?: Prisma.ClientCreateOrConnectWithoutSegmentInput | Prisma.ClientCreateOrConnectWithoutSegmentInput[];
    createMany?: Prisma.ClientCreateManySegmentInputEnvelope;
    connect?: Prisma.ClientWhereUniqueInput | Prisma.ClientWhereUniqueInput[];
};
export type ClientUncheckedCreateNestedManyWithoutSegmentInput = {
    create?: Prisma.XOR<Prisma.ClientCreateWithoutSegmentInput, Prisma.ClientUncheckedCreateWithoutSegmentInput> | Prisma.ClientCreateWithoutSegmentInput[] | Prisma.ClientUncheckedCreateWithoutSegmentInput[];
    connectOrCreate?: Prisma.ClientCreateOrConnectWithoutSegmentInput | Prisma.ClientCreateOrConnectWithoutSegmentInput[];
    createMany?: Prisma.ClientCreateManySegmentInputEnvelope;
    connect?: Prisma.ClientWhereUniqueInput | Prisma.ClientWhereUniqueInput[];
};
export type ClientUpdateManyWithoutSegmentNestedInput = {
    create?: Prisma.XOR<Prisma.ClientCreateWithoutSegmentInput, Prisma.ClientUncheckedCreateWithoutSegmentInput> | Prisma.ClientCreateWithoutSegmentInput[] | Prisma.ClientUncheckedCreateWithoutSegmentInput[];
    connectOrCreate?: Prisma.ClientCreateOrConnectWithoutSegmentInput | Prisma.ClientCreateOrConnectWithoutSegmentInput[];
    upsert?: Prisma.ClientUpsertWithWhereUniqueWithoutSegmentInput | Prisma.ClientUpsertWithWhereUniqueWithoutSegmentInput[];
    createMany?: Prisma.ClientCreateManySegmentInputEnvelope;
    set?: Prisma.ClientWhereUniqueInput | Prisma.ClientWhereUniqueInput[];
    disconnect?: Prisma.ClientWhereUniqueInput | Prisma.ClientWhereUniqueInput[];
    delete?: Prisma.ClientWhereUniqueInput | Prisma.ClientWhereUniqueInput[];
    connect?: Prisma.ClientWhereUniqueInput | Prisma.ClientWhereUniqueInput[];
    update?: Prisma.ClientUpdateWithWhereUniqueWithoutSegmentInput | Prisma.ClientUpdateWithWhereUniqueWithoutSegmentInput[];
    updateMany?: Prisma.ClientUpdateManyWithWhereWithoutSegmentInput | Prisma.ClientUpdateManyWithWhereWithoutSegmentInput[];
    deleteMany?: Prisma.ClientScalarWhereInput | Prisma.ClientScalarWhereInput[];
};
export type ClientUncheckedUpdateManyWithoutSegmentNestedInput = {
    create?: Prisma.XOR<Prisma.ClientCreateWithoutSegmentInput, Prisma.ClientUncheckedCreateWithoutSegmentInput> | Prisma.ClientCreateWithoutSegmentInput[] | Prisma.ClientUncheckedCreateWithoutSegmentInput[];
    connectOrCreate?: Prisma.ClientCreateOrConnectWithoutSegmentInput | Prisma.ClientCreateOrConnectWithoutSegmentInput[];
    upsert?: Prisma.ClientUpsertWithWhereUniqueWithoutSegmentInput | Prisma.ClientUpsertWithWhereUniqueWithoutSegmentInput[];
    createMany?: Prisma.ClientCreateManySegmentInputEnvelope;
    set?: Prisma.ClientWhereUniqueInput | Prisma.ClientWhereUniqueInput[];
    disconnect?: Prisma.ClientWhereUniqueInput | Prisma.ClientWhereUniqueInput[];
    delete?: Prisma.ClientWhereUniqueInput | Prisma.ClientWhereUniqueInput[];
    connect?: Prisma.ClientWhereUniqueInput | Prisma.ClientWhereUniqueInput[];
    update?: Prisma.ClientUpdateWithWhereUniqueWithoutSegmentInput | Prisma.ClientUpdateWithWhereUniqueWithoutSegmentInput[];
    updateMany?: Prisma.ClientUpdateManyWithWhereWithoutSegmentInput | Prisma.ClientUpdateManyWithWhereWithoutSegmentInput[];
    deleteMany?: Prisma.ClientScalarWhereInput | Prisma.ClientScalarWhereInput[];
};
export type EnumClientSourceFieldUpdateOperationsInput = {
    set?: $Enums.ClientSource;
};
export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null;
};
export type NullableIntFieldUpdateOperationsInput = {
    set?: number | null;
    increment?: number;
    decrement?: number;
    multiply?: number;
    divide?: number;
};
export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null;
};
export type DecimalFieldUpdateOperationsInput = {
    set?: runtime.Decimal | runtime.DecimalJsLike | number | string;
    increment?: runtime.Decimal | runtime.DecimalJsLike | number | string;
    decrement?: runtime.Decimal | runtime.DecimalJsLike | number | string;
    multiply?: runtime.Decimal | runtime.DecimalJsLike | number | string;
    divide?: runtime.Decimal | runtime.DecimalJsLike | number | string;
};
export type ClientCreateNestedOneWithoutMessagesInput = {
    create?: Prisma.XOR<Prisma.ClientCreateWithoutMessagesInput, Prisma.ClientUncheckedCreateWithoutMessagesInput>;
    connectOrCreate?: Prisma.ClientCreateOrConnectWithoutMessagesInput;
    connect?: Prisma.ClientWhereUniqueInput;
};
export type ClientUpdateOneRequiredWithoutMessagesNestedInput = {
    create?: Prisma.XOR<Prisma.ClientCreateWithoutMessagesInput, Prisma.ClientUncheckedCreateWithoutMessagesInput>;
    connectOrCreate?: Prisma.ClientCreateOrConnectWithoutMessagesInput;
    upsert?: Prisma.ClientUpsertWithoutMessagesInput;
    connect?: Prisma.ClientWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.ClientUpdateToOneWithWhereWithoutMessagesInput, Prisma.ClientUpdateWithoutMessagesInput>, Prisma.ClientUncheckedUpdateWithoutMessagesInput>;
};
export type ClientCreateNestedOneWithoutTagsInput = {
    create?: Prisma.XOR<Prisma.ClientCreateWithoutTagsInput, Prisma.ClientUncheckedCreateWithoutTagsInput>;
    connectOrCreate?: Prisma.ClientCreateOrConnectWithoutTagsInput;
    connect?: Prisma.ClientWhereUniqueInput;
};
export type ClientUpdateOneRequiredWithoutTagsNestedInput = {
    create?: Prisma.XOR<Prisma.ClientCreateWithoutTagsInput, Prisma.ClientUncheckedCreateWithoutTagsInput>;
    connectOrCreate?: Prisma.ClientCreateOrConnectWithoutTagsInput;
    upsert?: Prisma.ClientUpsertWithoutTagsInput;
    connect?: Prisma.ClientWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.ClientUpdateToOneWithWhereWithoutTagsInput, Prisma.ClientUpdateWithoutTagsInput>, Prisma.ClientUncheckedUpdateWithoutTagsInput>;
};
export type ClientCreateNestedOneWithoutTasksInput = {
    create?: Prisma.XOR<Prisma.ClientCreateWithoutTasksInput, Prisma.ClientUncheckedCreateWithoutTasksInput>;
    connectOrCreate?: Prisma.ClientCreateOrConnectWithoutTasksInput;
    connect?: Prisma.ClientWhereUniqueInput;
};
export type ClientUpdateOneRequiredWithoutTasksNestedInput = {
    create?: Prisma.XOR<Prisma.ClientCreateWithoutTasksInput, Prisma.ClientUncheckedCreateWithoutTasksInput>;
    connectOrCreate?: Prisma.ClientCreateOrConnectWithoutTasksInput;
    upsert?: Prisma.ClientUpsertWithoutTasksInput;
    connect?: Prisma.ClientWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.ClientUpdateToOneWithWhereWithoutTasksInput, Prisma.ClientUpdateWithoutTasksInput>, Prisma.ClientUncheckedUpdateWithoutTasksInput>;
};
export type ClientCreateNestedOneWithoutOrdersInput = {
    create?: Prisma.XOR<Prisma.ClientCreateWithoutOrdersInput, Prisma.ClientUncheckedCreateWithoutOrdersInput>;
    connectOrCreate?: Prisma.ClientCreateOrConnectWithoutOrdersInput;
    connect?: Prisma.ClientWhereUniqueInput;
};
export type ClientUpdateOneWithoutOrdersNestedInput = {
    create?: Prisma.XOR<Prisma.ClientCreateWithoutOrdersInput, Prisma.ClientUncheckedCreateWithoutOrdersInput>;
    connectOrCreate?: Prisma.ClientCreateOrConnectWithoutOrdersInput;
    upsert?: Prisma.ClientUpsertWithoutOrdersInput;
    disconnect?: Prisma.ClientWhereInput | boolean;
    delete?: Prisma.ClientWhereInput | boolean;
    connect?: Prisma.ClientWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.ClientUpdateToOneWithWhereWithoutOrdersInput, Prisma.ClientUpdateWithoutOrdersInput>, Prisma.ClientUncheckedUpdateWithoutOrdersInput>;
};
export type ClientCreateNestedOneWithoutReservationsInput = {
    create?: Prisma.XOR<Prisma.ClientCreateWithoutReservationsInput, Prisma.ClientUncheckedCreateWithoutReservationsInput>;
    connectOrCreate?: Prisma.ClientCreateOrConnectWithoutReservationsInput;
    connect?: Prisma.ClientWhereUniqueInput;
};
export type ClientUpdateOneRequiredWithoutReservationsNestedInput = {
    create?: Prisma.XOR<Prisma.ClientCreateWithoutReservationsInput, Prisma.ClientUncheckedCreateWithoutReservationsInput>;
    connectOrCreate?: Prisma.ClientCreateOrConnectWithoutReservationsInput;
    upsert?: Prisma.ClientUpsertWithoutReservationsInput;
    connect?: Prisma.ClientWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.ClientUpdateToOneWithWhereWithoutReservationsInput, Prisma.ClientUpdateWithoutReservationsInput>, Prisma.ClientUncheckedUpdateWithoutReservationsInput>;
};
export type ClientCreateWithoutSegmentInput = {
    name: string;
    source: $Enums.ClientSource;
    externalId?: string | null;
    notes?: string | null;
    telegramTopicId?: number | null;
    pinnedMessageId?: number | null;
    phone?: string | null;
    fullName?: string | null;
    email?: string | null;
    birthDate?: Date | string | null;
    lastPurchaseDate?: Date | string | null;
    totalPurchases?: number;
    totalRevenue?: runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    messages?: Prisma.MessageCreateNestedManyWithoutClientInput;
    tags?: Prisma.TagCreateNestedManyWithoutClientInput;
    tasks?: Prisma.TaskCreateNestedManyWithoutClientInput;
    orders?: Prisma.OrderCreateNestedManyWithoutClientInput;
    reservations?: Prisma.ReservationCreateNestedManyWithoutClientInput;
};
export type ClientUncheckedCreateWithoutSegmentInput = {
    id?: number;
    name: string;
    source: $Enums.ClientSource;
    externalId?: string | null;
    notes?: string | null;
    telegramTopicId?: number | null;
    pinnedMessageId?: number | null;
    phone?: string | null;
    fullName?: string | null;
    email?: string | null;
    birthDate?: Date | string | null;
    lastPurchaseDate?: Date | string | null;
    totalPurchases?: number;
    totalRevenue?: runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    messages?: Prisma.MessageUncheckedCreateNestedManyWithoutClientInput;
    tags?: Prisma.TagUncheckedCreateNestedManyWithoutClientInput;
    tasks?: Prisma.TaskUncheckedCreateNestedManyWithoutClientInput;
    orders?: Prisma.OrderUncheckedCreateNestedManyWithoutClientInput;
    reservations?: Prisma.ReservationUncheckedCreateNestedManyWithoutClientInput;
};
export type ClientCreateOrConnectWithoutSegmentInput = {
    where: Prisma.ClientWhereUniqueInput;
    create: Prisma.XOR<Prisma.ClientCreateWithoutSegmentInput, Prisma.ClientUncheckedCreateWithoutSegmentInput>;
};
export type ClientCreateManySegmentInputEnvelope = {
    data: Prisma.ClientCreateManySegmentInput | Prisma.ClientCreateManySegmentInput[];
    skipDuplicates?: boolean;
};
export type ClientUpsertWithWhereUniqueWithoutSegmentInput = {
    where: Prisma.ClientWhereUniqueInput;
    update: Prisma.XOR<Prisma.ClientUpdateWithoutSegmentInput, Prisma.ClientUncheckedUpdateWithoutSegmentInput>;
    create: Prisma.XOR<Prisma.ClientCreateWithoutSegmentInput, Prisma.ClientUncheckedCreateWithoutSegmentInput>;
};
export type ClientUpdateWithWhereUniqueWithoutSegmentInput = {
    where: Prisma.ClientWhereUniqueInput;
    data: Prisma.XOR<Prisma.ClientUpdateWithoutSegmentInput, Prisma.ClientUncheckedUpdateWithoutSegmentInput>;
};
export type ClientUpdateManyWithWhereWithoutSegmentInput = {
    where: Prisma.ClientScalarWhereInput;
    data: Prisma.XOR<Prisma.ClientUpdateManyMutationInput, Prisma.ClientUncheckedUpdateManyWithoutSegmentInput>;
};
export type ClientScalarWhereInput = {
    AND?: Prisma.ClientScalarWhereInput | Prisma.ClientScalarWhereInput[];
    OR?: Prisma.ClientScalarWhereInput[];
    NOT?: Prisma.ClientScalarWhereInput | Prisma.ClientScalarWhereInput[];
    id?: Prisma.IntFilter<"Client"> | number;
    name?: Prisma.StringFilter<"Client"> | string;
    source?: Prisma.EnumClientSourceFilter<"Client"> | $Enums.ClientSource;
    externalId?: Prisma.StringNullableFilter<"Client"> | string | null;
    segmentId?: Prisma.IntNullableFilter<"Client"> | number | null;
    notes?: Prisma.StringNullableFilter<"Client"> | string | null;
    telegramTopicId?: Prisma.IntNullableFilter<"Client"> | number | null;
    pinnedMessageId?: Prisma.IntNullableFilter<"Client"> | number | null;
    phone?: Prisma.StringNullableFilter<"Client"> | string | null;
    fullName?: Prisma.StringNullableFilter<"Client"> | string | null;
    email?: Prisma.StringNullableFilter<"Client"> | string | null;
    birthDate?: Prisma.DateTimeNullableFilter<"Client"> | Date | string | null;
    lastPurchaseDate?: Prisma.DateTimeNullableFilter<"Client"> | Date | string | null;
    totalPurchases?: Prisma.IntFilter<"Client"> | number;
    totalRevenue?: Prisma.DecimalFilter<"Client"> | runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Prisma.DateTimeFilter<"Client"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"Client"> | Date | string;
};
export type ClientCreateWithoutMessagesInput = {
    name: string;
    source: $Enums.ClientSource;
    externalId?: string | null;
    notes?: string | null;
    telegramTopicId?: number | null;
    pinnedMessageId?: number | null;
    phone?: string | null;
    fullName?: string | null;
    email?: string | null;
    birthDate?: Date | string | null;
    lastPurchaseDate?: Date | string | null;
    totalPurchases?: number;
    totalRevenue?: runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    segment?: Prisma.SegmentCreateNestedOneWithoutClientsInput;
    tags?: Prisma.TagCreateNestedManyWithoutClientInput;
    tasks?: Prisma.TaskCreateNestedManyWithoutClientInput;
    orders?: Prisma.OrderCreateNestedManyWithoutClientInput;
    reservations?: Prisma.ReservationCreateNestedManyWithoutClientInput;
};
export type ClientUncheckedCreateWithoutMessagesInput = {
    id?: number;
    name: string;
    source: $Enums.ClientSource;
    externalId?: string | null;
    segmentId?: number | null;
    notes?: string | null;
    telegramTopicId?: number | null;
    pinnedMessageId?: number | null;
    phone?: string | null;
    fullName?: string | null;
    email?: string | null;
    birthDate?: Date | string | null;
    lastPurchaseDate?: Date | string | null;
    totalPurchases?: number;
    totalRevenue?: runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    tags?: Prisma.TagUncheckedCreateNestedManyWithoutClientInput;
    tasks?: Prisma.TaskUncheckedCreateNestedManyWithoutClientInput;
    orders?: Prisma.OrderUncheckedCreateNestedManyWithoutClientInput;
    reservations?: Prisma.ReservationUncheckedCreateNestedManyWithoutClientInput;
};
export type ClientCreateOrConnectWithoutMessagesInput = {
    where: Prisma.ClientWhereUniqueInput;
    create: Prisma.XOR<Prisma.ClientCreateWithoutMessagesInput, Prisma.ClientUncheckedCreateWithoutMessagesInput>;
};
export type ClientUpsertWithoutMessagesInput = {
    update: Prisma.XOR<Prisma.ClientUpdateWithoutMessagesInput, Prisma.ClientUncheckedUpdateWithoutMessagesInput>;
    create: Prisma.XOR<Prisma.ClientCreateWithoutMessagesInput, Prisma.ClientUncheckedCreateWithoutMessagesInput>;
    where?: Prisma.ClientWhereInput;
};
export type ClientUpdateToOneWithWhereWithoutMessagesInput = {
    where?: Prisma.ClientWhereInput;
    data: Prisma.XOR<Prisma.ClientUpdateWithoutMessagesInput, Prisma.ClientUncheckedUpdateWithoutMessagesInput>;
};
export type ClientUpdateWithoutMessagesInput = {
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    source?: Prisma.EnumClientSourceFieldUpdateOperationsInput | $Enums.ClientSource;
    externalId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    notes?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    telegramTopicId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    pinnedMessageId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    phone?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    fullName?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    email?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    birthDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    lastPurchaseDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    totalPurchases?: Prisma.IntFieldUpdateOperationsInput | number;
    totalRevenue?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    segment?: Prisma.SegmentUpdateOneWithoutClientsNestedInput;
    tags?: Prisma.TagUpdateManyWithoutClientNestedInput;
    tasks?: Prisma.TaskUpdateManyWithoutClientNestedInput;
    orders?: Prisma.OrderUpdateManyWithoutClientNestedInput;
    reservations?: Prisma.ReservationUpdateManyWithoutClientNestedInput;
};
export type ClientUncheckedUpdateWithoutMessagesInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    source?: Prisma.EnumClientSourceFieldUpdateOperationsInput | $Enums.ClientSource;
    externalId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    segmentId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    notes?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    telegramTopicId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    pinnedMessageId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    phone?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    fullName?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    email?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    birthDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    lastPurchaseDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    totalPurchases?: Prisma.IntFieldUpdateOperationsInput | number;
    totalRevenue?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    tags?: Prisma.TagUncheckedUpdateManyWithoutClientNestedInput;
    tasks?: Prisma.TaskUncheckedUpdateManyWithoutClientNestedInput;
    orders?: Prisma.OrderUncheckedUpdateManyWithoutClientNestedInput;
    reservations?: Prisma.ReservationUncheckedUpdateManyWithoutClientNestedInput;
};
export type ClientCreateWithoutTagsInput = {
    name: string;
    source: $Enums.ClientSource;
    externalId?: string | null;
    notes?: string | null;
    telegramTopicId?: number | null;
    pinnedMessageId?: number | null;
    phone?: string | null;
    fullName?: string | null;
    email?: string | null;
    birthDate?: Date | string | null;
    lastPurchaseDate?: Date | string | null;
    totalPurchases?: number;
    totalRevenue?: runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    segment?: Prisma.SegmentCreateNestedOneWithoutClientsInput;
    messages?: Prisma.MessageCreateNestedManyWithoutClientInput;
    tasks?: Prisma.TaskCreateNestedManyWithoutClientInput;
    orders?: Prisma.OrderCreateNestedManyWithoutClientInput;
    reservations?: Prisma.ReservationCreateNestedManyWithoutClientInput;
};
export type ClientUncheckedCreateWithoutTagsInput = {
    id?: number;
    name: string;
    source: $Enums.ClientSource;
    externalId?: string | null;
    segmentId?: number | null;
    notes?: string | null;
    telegramTopicId?: number | null;
    pinnedMessageId?: number | null;
    phone?: string | null;
    fullName?: string | null;
    email?: string | null;
    birthDate?: Date | string | null;
    lastPurchaseDate?: Date | string | null;
    totalPurchases?: number;
    totalRevenue?: runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    messages?: Prisma.MessageUncheckedCreateNestedManyWithoutClientInput;
    tasks?: Prisma.TaskUncheckedCreateNestedManyWithoutClientInput;
    orders?: Prisma.OrderUncheckedCreateNestedManyWithoutClientInput;
    reservations?: Prisma.ReservationUncheckedCreateNestedManyWithoutClientInput;
};
export type ClientCreateOrConnectWithoutTagsInput = {
    where: Prisma.ClientWhereUniqueInput;
    create: Prisma.XOR<Prisma.ClientCreateWithoutTagsInput, Prisma.ClientUncheckedCreateWithoutTagsInput>;
};
export type ClientUpsertWithoutTagsInput = {
    update: Prisma.XOR<Prisma.ClientUpdateWithoutTagsInput, Prisma.ClientUncheckedUpdateWithoutTagsInput>;
    create: Prisma.XOR<Prisma.ClientCreateWithoutTagsInput, Prisma.ClientUncheckedCreateWithoutTagsInput>;
    where?: Prisma.ClientWhereInput;
};
export type ClientUpdateToOneWithWhereWithoutTagsInput = {
    where?: Prisma.ClientWhereInput;
    data: Prisma.XOR<Prisma.ClientUpdateWithoutTagsInput, Prisma.ClientUncheckedUpdateWithoutTagsInput>;
};
export type ClientUpdateWithoutTagsInput = {
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    source?: Prisma.EnumClientSourceFieldUpdateOperationsInput | $Enums.ClientSource;
    externalId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    notes?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    telegramTopicId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    pinnedMessageId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    phone?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    fullName?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    email?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    birthDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    lastPurchaseDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    totalPurchases?: Prisma.IntFieldUpdateOperationsInput | number;
    totalRevenue?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    segment?: Prisma.SegmentUpdateOneWithoutClientsNestedInput;
    messages?: Prisma.MessageUpdateManyWithoutClientNestedInput;
    tasks?: Prisma.TaskUpdateManyWithoutClientNestedInput;
    orders?: Prisma.OrderUpdateManyWithoutClientNestedInput;
    reservations?: Prisma.ReservationUpdateManyWithoutClientNestedInput;
};
export type ClientUncheckedUpdateWithoutTagsInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    source?: Prisma.EnumClientSourceFieldUpdateOperationsInput | $Enums.ClientSource;
    externalId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    segmentId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    notes?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    telegramTopicId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    pinnedMessageId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    phone?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    fullName?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    email?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    birthDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    lastPurchaseDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    totalPurchases?: Prisma.IntFieldUpdateOperationsInput | number;
    totalRevenue?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    messages?: Prisma.MessageUncheckedUpdateManyWithoutClientNestedInput;
    tasks?: Prisma.TaskUncheckedUpdateManyWithoutClientNestedInput;
    orders?: Prisma.OrderUncheckedUpdateManyWithoutClientNestedInput;
    reservations?: Prisma.ReservationUncheckedUpdateManyWithoutClientNestedInput;
};
export type ClientCreateWithoutTasksInput = {
    name: string;
    source: $Enums.ClientSource;
    externalId?: string | null;
    notes?: string | null;
    telegramTopicId?: number | null;
    pinnedMessageId?: number | null;
    phone?: string | null;
    fullName?: string | null;
    email?: string | null;
    birthDate?: Date | string | null;
    lastPurchaseDate?: Date | string | null;
    totalPurchases?: number;
    totalRevenue?: runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    segment?: Prisma.SegmentCreateNestedOneWithoutClientsInput;
    messages?: Prisma.MessageCreateNestedManyWithoutClientInput;
    tags?: Prisma.TagCreateNestedManyWithoutClientInput;
    orders?: Prisma.OrderCreateNestedManyWithoutClientInput;
    reservations?: Prisma.ReservationCreateNestedManyWithoutClientInput;
};
export type ClientUncheckedCreateWithoutTasksInput = {
    id?: number;
    name: string;
    source: $Enums.ClientSource;
    externalId?: string | null;
    segmentId?: number | null;
    notes?: string | null;
    telegramTopicId?: number | null;
    pinnedMessageId?: number | null;
    phone?: string | null;
    fullName?: string | null;
    email?: string | null;
    birthDate?: Date | string | null;
    lastPurchaseDate?: Date | string | null;
    totalPurchases?: number;
    totalRevenue?: runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    messages?: Prisma.MessageUncheckedCreateNestedManyWithoutClientInput;
    tags?: Prisma.TagUncheckedCreateNestedManyWithoutClientInput;
    orders?: Prisma.OrderUncheckedCreateNestedManyWithoutClientInput;
    reservations?: Prisma.ReservationUncheckedCreateNestedManyWithoutClientInput;
};
export type ClientCreateOrConnectWithoutTasksInput = {
    where: Prisma.ClientWhereUniqueInput;
    create: Prisma.XOR<Prisma.ClientCreateWithoutTasksInput, Prisma.ClientUncheckedCreateWithoutTasksInput>;
};
export type ClientUpsertWithoutTasksInput = {
    update: Prisma.XOR<Prisma.ClientUpdateWithoutTasksInput, Prisma.ClientUncheckedUpdateWithoutTasksInput>;
    create: Prisma.XOR<Prisma.ClientCreateWithoutTasksInput, Prisma.ClientUncheckedCreateWithoutTasksInput>;
    where?: Prisma.ClientWhereInput;
};
export type ClientUpdateToOneWithWhereWithoutTasksInput = {
    where?: Prisma.ClientWhereInput;
    data: Prisma.XOR<Prisma.ClientUpdateWithoutTasksInput, Prisma.ClientUncheckedUpdateWithoutTasksInput>;
};
export type ClientUpdateWithoutTasksInput = {
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    source?: Prisma.EnumClientSourceFieldUpdateOperationsInput | $Enums.ClientSource;
    externalId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    notes?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    telegramTopicId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    pinnedMessageId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    phone?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    fullName?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    email?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    birthDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    lastPurchaseDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    totalPurchases?: Prisma.IntFieldUpdateOperationsInput | number;
    totalRevenue?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    segment?: Prisma.SegmentUpdateOneWithoutClientsNestedInput;
    messages?: Prisma.MessageUpdateManyWithoutClientNestedInput;
    tags?: Prisma.TagUpdateManyWithoutClientNestedInput;
    orders?: Prisma.OrderUpdateManyWithoutClientNestedInput;
    reservations?: Prisma.ReservationUpdateManyWithoutClientNestedInput;
};
export type ClientUncheckedUpdateWithoutTasksInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    source?: Prisma.EnumClientSourceFieldUpdateOperationsInput | $Enums.ClientSource;
    externalId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    segmentId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    notes?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    telegramTopicId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    pinnedMessageId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    phone?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    fullName?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    email?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    birthDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    lastPurchaseDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    totalPurchases?: Prisma.IntFieldUpdateOperationsInput | number;
    totalRevenue?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    messages?: Prisma.MessageUncheckedUpdateManyWithoutClientNestedInput;
    tags?: Prisma.TagUncheckedUpdateManyWithoutClientNestedInput;
    orders?: Prisma.OrderUncheckedUpdateManyWithoutClientNestedInput;
    reservations?: Prisma.ReservationUncheckedUpdateManyWithoutClientNestedInput;
};
export type ClientCreateWithoutOrdersInput = {
    name: string;
    source: $Enums.ClientSource;
    externalId?: string | null;
    notes?: string | null;
    telegramTopicId?: number | null;
    pinnedMessageId?: number | null;
    phone?: string | null;
    fullName?: string | null;
    email?: string | null;
    birthDate?: Date | string | null;
    lastPurchaseDate?: Date | string | null;
    totalPurchases?: number;
    totalRevenue?: runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    segment?: Prisma.SegmentCreateNestedOneWithoutClientsInput;
    messages?: Prisma.MessageCreateNestedManyWithoutClientInput;
    tags?: Prisma.TagCreateNestedManyWithoutClientInput;
    tasks?: Prisma.TaskCreateNestedManyWithoutClientInput;
    reservations?: Prisma.ReservationCreateNestedManyWithoutClientInput;
};
export type ClientUncheckedCreateWithoutOrdersInput = {
    id?: number;
    name: string;
    source: $Enums.ClientSource;
    externalId?: string | null;
    segmentId?: number | null;
    notes?: string | null;
    telegramTopicId?: number | null;
    pinnedMessageId?: number | null;
    phone?: string | null;
    fullName?: string | null;
    email?: string | null;
    birthDate?: Date | string | null;
    lastPurchaseDate?: Date | string | null;
    totalPurchases?: number;
    totalRevenue?: runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    messages?: Prisma.MessageUncheckedCreateNestedManyWithoutClientInput;
    tags?: Prisma.TagUncheckedCreateNestedManyWithoutClientInput;
    tasks?: Prisma.TaskUncheckedCreateNestedManyWithoutClientInput;
    reservations?: Prisma.ReservationUncheckedCreateNestedManyWithoutClientInput;
};
export type ClientCreateOrConnectWithoutOrdersInput = {
    where: Prisma.ClientWhereUniqueInput;
    create: Prisma.XOR<Prisma.ClientCreateWithoutOrdersInput, Prisma.ClientUncheckedCreateWithoutOrdersInput>;
};
export type ClientUpsertWithoutOrdersInput = {
    update: Prisma.XOR<Prisma.ClientUpdateWithoutOrdersInput, Prisma.ClientUncheckedUpdateWithoutOrdersInput>;
    create: Prisma.XOR<Prisma.ClientCreateWithoutOrdersInput, Prisma.ClientUncheckedCreateWithoutOrdersInput>;
    where?: Prisma.ClientWhereInput;
};
export type ClientUpdateToOneWithWhereWithoutOrdersInput = {
    where?: Prisma.ClientWhereInput;
    data: Prisma.XOR<Prisma.ClientUpdateWithoutOrdersInput, Prisma.ClientUncheckedUpdateWithoutOrdersInput>;
};
export type ClientUpdateWithoutOrdersInput = {
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    source?: Prisma.EnumClientSourceFieldUpdateOperationsInput | $Enums.ClientSource;
    externalId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    notes?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    telegramTopicId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    pinnedMessageId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    phone?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    fullName?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    email?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    birthDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    lastPurchaseDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    totalPurchases?: Prisma.IntFieldUpdateOperationsInput | number;
    totalRevenue?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    segment?: Prisma.SegmentUpdateOneWithoutClientsNestedInput;
    messages?: Prisma.MessageUpdateManyWithoutClientNestedInput;
    tags?: Prisma.TagUpdateManyWithoutClientNestedInput;
    tasks?: Prisma.TaskUpdateManyWithoutClientNestedInput;
    reservations?: Prisma.ReservationUpdateManyWithoutClientNestedInput;
};
export type ClientUncheckedUpdateWithoutOrdersInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    source?: Prisma.EnumClientSourceFieldUpdateOperationsInput | $Enums.ClientSource;
    externalId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    segmentId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    notes?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    telegramTopicId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    pinnedMessageId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    phone?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    fullName?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    email?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    birthDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    lastPurchaseDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    totalPurchases?: Prisma.IntFieldUpdateOperationsInput | number;
    totalRevenue?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    messages?: Prisma.MessageUncheckedUpdateManyWithoutClientNestedInput;
    tags?: Prisma.TagUncheckedUpdateManyWithoutClientNestedInput;
    tasks?: Prisma.TaskUncheckedUpdateManyWithoutClientNestedInput;
    reservations?: Prisma.ReservationUncheckedUpdateManyWithoutClientNestedInput;
};
export type ClientCreateWithoutReservationsInput = {
    name: string;
    source: $Enums.ClientSource;
    externalId?: string | null;
    notes?: string | null;
    telegramTopicId?: number | null;
    pinnedMessageId?: number | null;
    phone?: string | null;
    fullName?: string | null;
    email?: string | null;
    birthDate?: Date | string | null;
    lastPurchaseDate?: Date | string | null;
    totalPurchases?: number;
    totalRevenue?: runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    segment?: Prisma.SegmentCreateNestedOneWithoutClientsInput;
    messages?: Prisma.MessageCreateNestedManyWithoutClientInput;
    tags?: Prisma.TagCreateNestedManyWithoutClientInput;
    tasks?: Prisma.TaskCreateNestedManyWithoutClientInput;
    orders?: Prisma.OrderCreateNestedManyWithoutClientInput;
};
export type ClientUncheckedCreateWithoutReservationsInput = {
    id?: number;
    name: string;
    source: $Enums.ClientSource;
    externalId?: string | null;
    segmentId?: number | null;
    notes?: string | null;
    telegramTopicId?: number | null;
    pinnedMessageId?: number | null;
    phone?: string | null;
    fullName?: string | null;
    email?: string | null;
    birthDate?: Date | string | null;
    lastPurchaseDate?: Date | string | null;
    totalPurchases?: number;
    totalRevenue?: runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    messages?: Prisma.MessageUncheckedCreateNestedManyWithoutClientInput;
    tags?: Prisma.TagUncheckedCreateNestedManyWithoutClientInput;
    tasks?: Prisma.TaskUncheckedCreateNestedManyWithoutClientInput;
    orders?: Prisma.OrderUncheckedCreateNestedManyWithoutClientInput;
};
export type ClientCreateOrConnectWithoutReservationsInput = {
    where: Prisma.ClientWhereUniqueInput;
    create: Prisma.XOR<Prisma.ClientCreateWithoutReservationsInput, Prisma.ClientUncheckedCreateWithoutReservationsInput>;
};
export type ClientUpsertWithoutReservationsInput = {
    update: Prisma.XOR<Prisma.ClientUpdateWithoutReservationsInput, Prisma.ClientUncheckedUpdateWithoutReservationsInput>;
    create: Prisma.XOR<Prisma.ClientCreateWithoutReservationsInput, Prisma.ClientUncheckedCreateWithoutReservationsInput>;
    where?: Prisma.ClientWhereInput;
};
export type ClientUpdateToOneWithWhereWithoutReservationsInput = {
    where?: Prisma.ClientWhereInput;
    data: Prisma.XOR<Prisma.ClientUpdateWithoutReservationsInput, Prisma.ClientUncheckedUpdateWithoutReservationsInput>;
};
export type ClientUpdateWithoutReservationsInput = {
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    source?: Prisma.EnumClientSourceFieldUpdateOperationsInput | $Enums.ClientSource;
    externalId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    notes?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    telegramTopicId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    pinnedMessageId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    phone?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    fullName?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    email?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    birthDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    lastPurchaseDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    totalPurchases?: Prisma.IntFieldUpdateOperationsInput | number;
    totalRevenue?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    segment?: Prisma.SegmentUpdateOneWithoutClientsNestedInput;
    messages?: Prisma.MessageUpdateManyWithoutClientNestedInput;
    tags?: Prisma.TagUpdateManyWithoutClientNestedInput;
    tasks?: Prisma.TaskUpdateManyWithoutClientNestedInput;
    orders?: Prisma.OrderUpdateManyWithoutClientNestedInput;
};
export type ClientUncheckedUpdateWithoutReservationsInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    source?: Prisma.EnumClientSourceFieldUpdateOperationsInput | $Enums.ClientSource;
    externalId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    segmentId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    notes?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    telegramTopicId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    pinnedMessageId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    phone?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    fullName?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    email?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    birthDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    lastPurchaseDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    totalPurchases?: Prisma.IntFieldUpdateOperationsInput | number;
    totalRevenue?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    messages?: Prisma.MessageUncheckedUpdateManyWithoutClientNestedInput;
    tags?: Prisma.TagUncheckedUpdateManyWithoutClientNestedInput;
    tasks?: Prisma.TaskUncheckedUpdateManyWithoutClientNestedInput;
    orders?: Prisma.OrderUncheckedUpdateManyWithoutClientNestedInput;
};
export type ClientCreateManySegmentInput = {
    id?: number;
    name: string;
    source: $Enums.ClientSource;
    externalId?: string | null;
    notes?: string | null;
    telegramTopicId?: number | null;
    pinnedMessageId?: number | null;
    phone?: string | null;
    fullName?: string | null;
    email?: string | null;
    birthDate?: Date | string | null;
    lastPurchaseDate?: Date | string | null;
    totalPurchases?: number;
    totalRevenue?: runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type ClientUpdateWithoutSegmentInput = {
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    source?: Prisma.EnumClientSourceFieldUpdateOperationsInput | $Enums.ClientSource;
    externalId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    notes?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    telegramTopicId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    pinnedMessageId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    phone?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    fullName?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    email?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    birthDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    lastPurchaseDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    totalPurchases?: Prisma.IntFieldUpdateOperationsInput | number;
    totalRevenue?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    messages?: Prisma.MessageUpdateManyWithoutClientNestedInput;
    tags?: Prisma.TagUpdateManyWithoutClientNestedInput;
    tasks?: Prisma.TaskUpdateManyWithoutClientNestedInput;
    orders?: Prisma.OrderUpdateManyWithoutClientNestedInput;
    reservations?: Prisma.ReservationUpdateManyWithoutClientNestedInput;
};
export type ClientUncheckedUpdateWithoutSegmentInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    source?: Prisma.EnumClientSourceFieldUpdateOperationsInput | $Enums.ClientSource;
    externalId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    notes?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    telegramTopicId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    pinnedMessageId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    phone?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    fullName?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    email?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    birthDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    lastPurchaseDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    totalPurchases?: Prisma.IntFieldUpdateOperationsInput | number;
    totalRevenue?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    messages?: Prisma.MessageUncheckedUpdateManyWithoutClientNestedInput;
    tags?: Prisma.TagUncheckedUpdateManyWithoutClientNestedInput;
    tasks?: Prisma.TaskUncheckedUpdateManyWithoutClientNestedInput;
    orders?: Prisma.OrderUncheckedUpdateManyWithoutClientNestedInput;
    reservations?: Prisma.ReservationUncheckedUpdateManyWithoutClientNestedInput;
};
export type ClientUncheckedUpdateManyWithoutSegmentInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    name?: Prisma.StringFieldUpdateOperationsInput | string;
    source?: Prisma.EnumClientSourceFieldUpdateOperationsInput | $Enums.ClientSource;
    externalId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    notes?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    telegramTopicId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    pinnedMessageId?: Prisma.NullableIntFieldUpdateOperationsInput | number | null;
    phone?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    fullName?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    email?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    birthDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    lastPurchaseDate?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    totalPurchases?: Prisma.IntFieldUpdateOperationsInput | number;
    totalRevenue?: Prisma.DecimalFieldUpdateOperationsInput | runtime.Decimal | runtime.DecimalJsLike | number | string;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
/**
 * Count Type ClientCountOutputType
 */
export type ClientCountOutputType = {
    messages: number;
    tags: number;
    tasks: number;
    orders: number;
    reservations: number;
};
export type ClientCountOutputTypeSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    messages?: boolean | ClientCountOutputTypeCountMessagesArgs;
    tags?: boolean | ClientCountOutputTypeCountTagsArgs;
    tasks?: boolean | ClientCountOutputTypeCountTasksArgs;
    orders?: boolean | ClientCountOutputTypeCountOrdersArgs;
    reservations?: boolean | ClientCountOutputTypeCountReservationsArgs;
};
/**
 * ClientCountOutputType without action
 */
export type ClientCountOutputTypeDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ClientCountOutputType
     */
    select?: Prisma.ClientCountOutputTypeSelect<ExtArgs> | null;
};
/**
 * ClientCountOutputType without action
 */
export type ClientCountOutputTypeCountMessagesArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.MessageWhereInput;
};
/**
 * ClientCountOutputType without action
 */
export type ClientCountOutputTypeCountTagsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.TagWhereInput;
};
/**
 * ClientCountOutputType without action
 */
export type ClientCountOutputTypeCountTasksArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.TaskWhereInput;
};
/**
 * ClientCountOutputType without action
 */
export type ClientCountOutputTypeCountOrdersArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.OrderWhereInput;
};
/**
 * ClientCountOutputType without action
 */
export type ClientCountOutputTypeCountReservationsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.ReservationWhereInput;
};
export type ClientSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    name?: boolean;
    source?: boolean;
    externalId?: boolean;
    segmentId?: boolean;
    notes?: boolean;
    telegramTopicId?: boolean;
    pinnedMessageId?: boolean;
    phone?: boolean;
    fullName?: boolean;
    email?: boolean;
    birthDate?: boolean;
    lastPurchaseDate?: boolean;
    totalPurchases?: boolean;
    totalRevenue?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    segment?: boolean | Prisma.Client$segmentArgs<ExtArgs>;
    messages?: boolean | Prisma.Client$messagesArgs<ExtArgs>;
    tags?: boolean | Prisma.Client$tagsArgs<ExtArgs>;
    tasks?: boolean | Prisma.Client$tasksArgs<ExtArgs>;
    orders?: boolean | Prisma.Client$ordersArgs<ExtArgs>;
    reservations?: boolean | Prisma.Client$reservationsArgs<ExtArgs>;
    _count?: boolean | Prisma.ClientCountOutputTypeDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["client"]>;
export type ClientSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    name?: boolean;
    source?: boolean;
    externalId?: boolean;
    segmentId?: boolean;
    notes?: boolean;
    telegramTopicId?: boolean;
    pinnedMessageId?: boolean;
    phone?: boolean;
    fullName?: boolean;
    email?: boolean;
    birthDate?: boolean;
    lastPurchaseDate?: boolean;
    totalPurchases?: boolean;
    totalRevenue?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    segment?: boolean | Prisma.Client$segmentArgs<ExtArgs>;
}, ExtArgs["result"]["client"]>;
export type ClientSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    name?: boolean;
    source?: boolean;
    externalId?: boolean;
    segmentId?: boolean;
    notes?: boolean;
    telegramTopicId?: boolean;
    pinnedMessageId?: boolean;
    phone?: boolean;
    fullName?: boolean;
    email?: boolean;
    birthDate?: boolean;
    lastPurchaseDate?: boolean;
    totalPurchases?: boolean;
    totalRevenue?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    segment?: boolean | Prisma.Client$segmentArgs<ExtArgs>;
}, ExtArgs["result"]["client"]>;
export type ClientSelectScalar = {
    id?: boolean;
    name?: boolean;
    source?: boolean;
    externalId?: boolean;
    segmentId?: boolean;
    notes?: boolean;
    telegramTopicId?: boolean;
    pinnedMessageId?: boolean;
    phone?: boolean;
    fullName?: boolean;
    email?: boolean;
    birthDate?: boolean;
    lastPurchaseDate?: boolean;
    totalPurchases?: boolean;
    totalRevenue?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
};
export type ClientOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "name" | "source" | "externalId" | "segmentId" | "notes" | "telegramTopicId" | "pinnedMessageId" | "phone" | "fullName" | "email" | "birthDate" | "lastPurchaseDate" | "totalPurchases" | "totalRevenue" | "createdAt" | "updatedAt", ExtArgs["result"]["client"]>;
export type ClientInclude<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    segment?: boolean | Prisma.Client$segmentArgs<ExtArgs>;
    messages?: boolean | Prisma.Client$messagesArgs<ExtArgs>;
    tags?: boolean | Prisma.Client$tagsArgs<ExtArgs>;
    tasks?: boolean | Prisma.Client$tasksArgs<ExtArgs>;
    orders?: boolean | Prisma.Client$ordersArgs<ExtArgs>;
    reservations?: boolean | Prisma.Client$reservationsArgs<ExtArgs>;
    _count?: boolean | Prisma.ClientCountOutputTypeDefaultArgs<ExtArgs>;
};
export type ClientIncludeCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    segment?: boolean | Prisma.Client$segmentArgs<ExtArgs>;
};
export type ClientIncludeUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    segment?: boolean | Prisma.Client$segmentArgs<ExtArgs>;
};
export type $ClientPayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "Client";
    objects: {
        segment: Prisma.$SegmentPayload<ExtArgs> | null;
        messages: Prisma.$MessagePayload<ExtArgs>[];
        tags: Prisma.$TagPayload<ExtArgs>[];
        tasks: Prisma.$TaskPayload<ExtArgs>[];
        orders: Prisma.$OrderPayload<ExtArgs>[];
        reservations: Prisma.$ReservationPayload<ExtArgs>[];
    };
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: number;
        name: string;
        source: $Enums.ClientSource;
        externalId: string | null;
        segmentId: number | null;
        notes: string | null;
        telegramTopicId: number | null;
        pinnedMessageId: number | null;
        phone: string | null;
        fullName: string | null;
        email: string | null;
        birthDate: Date | null;
        lastPurchaseDate: Date | null;
        totalPurchases: number;
        totalRevenue: runtime.Decimal;
        createdAt: Date;
        updatedAt: Date;
    }, ExtArgs["result"]["client"]>;
    composites: {};
};
export type ClientGetPayload<S extends boolean | null | undefined | ClientDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$ClientPayload, S>;
export type ClientCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<ClientFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: ClientCountAggregateInputType | true;
};
export interface ClientDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['Client'];
        meta: {
            name: 'Client';
        };
    };
    /**
     * Find zero or one Client that matches the filter.
     * @param {ClientFindUniqueArgs} args - Arguments to find a Client
     * @example
     * // Get one Client
     * const client = await prisma.client.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ClientFindUniqueArgs>(args: Prisma.SelectSubset<T, ClientFindUniqueArgs<ExtArgs>>): Prisma.Prisma__ClientClient<runtime.Types.Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find one Client that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {ClientFindUniqueOrThrowArgs} args - Arguments to find a Client
     * @example
     * // Get one Client
     * const client = await prisma.client.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ClientFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, ClientFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__ClientClient<runtime.Types.Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first Client that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ClientFindFirstArgs} args - Arguments to find a Client
     * @example
     * // Get one Client
     * const client = await prisma.client.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ClientFindFirstArgs>(args?: Prisma.SelectSubset<T, ClientFindFirstArgs<ExtArgs>>): Prisma.Prisma__ClientClient<runtime.Types.Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first Client that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ClientFindFirstOrThrowArgs} args - Arguments to find a Client
     * @example
     * // Get one Client
     * const client = await prisma.client.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ClientFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, ClientFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__ClientClient<runtime.Types.Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find zero or more Clients that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ClientFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Clients
     * const clients = await prisma.client.findMany()
     *
     * // Get first 10 Clients
     * const clients = await prisma.client.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const clientWithIdOnly = await prisma.client.findMany({ select: { id: true } })
     *
     */
    findMany<T extends ClientFindManyArgs>(args?: Prisma.SelectSubset<T, ClientFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    /**
     * Create a Client.
     * @param {ClientCreateArgs} args - Arguments to create a Client.
     * @example
     * // Create one Client
     * const Client = await prisma.client.create({
     *   data: {
     *     // ... data to create a Client
     *   }
     * })
     *
     */
    create<T extends ClientCreateArgs>(args: Prisma.SelectSubset<T, ClientCreateArgs<ExtArgs>>): Prisma.Prisma__ClientClient<runtime.Types.Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Create many Clients.
     * @param {ClientCreateManyArgs} args - Arguments to create many Clients.
     * @example
     * // Create many Clients
     * const client = await prisma.client.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends ClientCreateManyArgs>(args?: Prisma.SelectSubset<T, ClientCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Create many Clients and returns the data saved in the database.
     * @param {ClientCreateManyAndReturnArgs} args - Arguments to create many Clients.
     * @example
     * // Create many Clients
     * const client = await prisma.client.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many Clients and only return the `id`
     * const clientWithIdOnly = await prisma.client.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends ClientCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, ClientCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    /**
     * Delete a Client.
     * @param {ClientDeleteArgs} args - Arguments to delete one Client.
     * @example
     * // Delete one Client
     * const Client = await prisma.client.delete({
     *   where: {
     *     // ... filter to delete one Client
     *   }
     * })
     *
     */
    delete<T extends ClientDeleteArgs>(args: Prisma.SelectSubset<T, ClientDeleteArgs<ExtArgs>>): Prisma.Prisma__ClientClient<runtime.Types.Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Update one Client.
     * @param {ClientUpdateArgs} args - Arguments to update one Client.
     * @example
     * // Update one Client
     * const client = await prisma.client.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends ClientUpdateArgs>(args: Prisma.SelectSubset<T, ClientUpdateArgs<ExtArgs>>): Prisma.Prisma__ClientClient<runtime.Types.Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Delete zero or more Clients.
     * @param {ClientDeleteManyArgs} args - Arguments to filter Clients to delete.
     * @example
     * // Delete a few Clients
     * const { count } = await prisma.client.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends ClientDeleteManyArgs>(args?: Prisma.SelectSubset<T, ClientDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more Clients.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ClientUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Clients
     * const client = await prisma.client.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends ClientUpdateManyArgs>(args: Prisma.SelectSubset<T, ClientUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more Clients and returns the data updated in the database.
     * @param {ClientUpdateManyAndReturnArgs} args - Arguments to update many Clients.
     * @example
     * // Update many Clients
     * const client = await prisma.client.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more Clients and only return the `id`
     * const clientWithIdOnly = await prisma.client.updateManyAndReturn({
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
    updateManyAndReturn<T extends ClientUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, ClientUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    /**
     * Create or update one Client.
     * @param {ClientUpsertArgs} args - Arguments to update or create a Client.
     * @example
     * // Update or create a Client
     * const client = await prisma.client.upsert({
     *   create: {
     *     // ... data to create a Client
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Client we want to update
     *   }
     * })
     */
    upsert<T extends ClientUpsertArgs>(args: Prisma.SelectSubset<T, ClientUpsertArgs<ExtArgs>>): Prisma.Prisma__ClientClient<runtime.Types.Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Count the number of Clients.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ClientCountArgs} args - Arguments to filter Clients to count.
     * @example
     * // Count the number of Clients
     * const count = await prisma.client.count({
     *   where: {
     *     // ... the filter for the Clients we want to count
     *   }
     * })
    **/
    count<T extends ClientCountArgs>(args?: Prisma.Subset<T, ClientCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], ClientCountAggregateOutputType> : number>;
    /**
     * Allows you to perform aggregations operations on a Client.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ClientAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends ClientAggregateArgs>(args: Prisma.Subset<T, ClientAggregateArgs>): Prisma.PrismaPromise<GetClientAggregateType<T>>;
    /**
     * Group by Client.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ClientGroupByArgs} args - Group by arguments.
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
    groupBy<T extends ClientGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: ClientGroupByArgs['orderBy'];
    } : {
        orderBy?: ClientGroupByArgs['orderBy'];
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
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, ClientGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetClientGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the Client model
     */
    readonly fields: ClientFieldRefs;
}
/**
 * The delegate class that acts as a "Promise-like" for Client.
 * Why is this prefixed with `Prisma__`?
 * Because we want to prevent naming conflicts as mentioned in
 * https://github.com/prisma/prisma-client-js/issues/707
 */
export interface Prisma__ClientClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    segment<T extends Prisma.Client$segmentArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.Client$segmentArgs<ExtArgs>>): Prisma.Prisma__SegmentClient<runtime.Types.Result.GetResult<Prisma.$SegmentPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    messages<T extends Prisma.Client$messagesArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.Client$messagesArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$MessagePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    tags<T extends Prisma.Client$tagsArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.Client$tagsArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$TagPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    tasks<T extends Prisma.Client$tasksArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.Client$tasksArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$TaskPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    orders<T extends Prisma.Client$ordersArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.Client$ordersArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$OrderPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    reservations<T extends Prisma.Client$reservationsArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.Client$reservationsArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ReservationPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
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
 * Fields of the Client model
 */
export interface ClientFieldRefs {
    readonly id: Prisma.FieldRef<"Client", 'Int'>;
    readonly name: Prisma.FieldRef<"Client", 'String'>;
    readonly source: Prisma.FieldRef<"Client", 'ClientSource'>;
    readonly externalId: Prisma.FieldRef<"Client", 'String'>;
    readonly segmentId: Prisma.FieldRef<"Client", 'Int'>;
    readonly notes: Prisma.FieldRef<"Client", 'String'>;
    readonly telegramTopicId: Prisma.FieldRef<"Client", 'Int'>;
    readonly pinnedMessageId: Prisma.FieldRef<"Client", 'Int'>;
    readonly phone: Prisma.FieldRef<"Client", 'String'>;
    readonly fullName: Prisma.FieldRef<"Client", 'String'>;
    readonly email: Prisma.FieldRef<"Client", 'String'>;
    readonly birthDate: Prisma.FieldRef<"Client", 'DateTime'>;
    readonly lastPurchaseDate: Prisma.FieldRef<"Client", 'DateTime'>;
    readonly totalPurchases: Prisma.FieldRef<"Client", 'Int'>;
    readonly totalRevenue: Prisma.FieldRef<"Client", 'Decimal'>;
    readonly createdAt: Prisma.FieldRef<"Client", 'DateTime'>;
    readonly updatedAt: Prisma.FieldRef<"Client", 'DateTime'>;
}
/**
 * Client findUnique
 */
export type ClientFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which Client to fetch.
     */
    where: Prisma.ClientWhereUniqueInput;
};
/**
 * Client findUniqueOrThrow
 */
export type ClientFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which Client to fetch.
     */
    where: Prisma.ClientWhereUniqueInput;
};
/**
 * Client findFirst
 */
export type ClientFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which Client to fetch.
     */
    where?: Prisma.ClientWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Clients to fetch.
     */
    orderBy?: Prisma.ClientOrderByWithRelationInput | Prisma.ClientOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Clients.
     */
    cursor?: Prisma.ClientWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Clients from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Clients.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Clients.
     */
    distinct?: Prisma.ClientScalarFieldEnum | Prisma.ClientScalarFieldEnum[];
};
/**
 * Client findFirstOrThrow
 */
export type ClientFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which Client to fetch.
     */
    where?: Prisma.ClientWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Clients to fetch.
     */
    orderBy?: Prisma.ClientOrderByWithRelationInput | Prisma.ClientOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Clients.
     */
    cursor?: Prisma.ClientWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Clients from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Clients.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Clients.
     */
    distinct?: Prisma.ClientScalarFieldEnum | Prisma.ClientScalarFieldEnum[];
};
/**
 * Client findMany
 */
export type ClientFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which Clients to fetch.
     */
    where?: Prisma.ClientWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Clients to fetch.
     */
    orderBy?: Prisma.ClientOrderByWithRelationInput | Prisma.ClientOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing Clients.
     */
    cursor?: Prisma.ClientWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Clients from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Clients.
     */
    skip?: number;
    distinct?: Prisma.ClientScalarFieldEnum | Prisma.ClientScalarFieldEnum[];
};
/**
 * Client create
 */
export type ClientCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The data needed to create a Client.
     */
    data: Prisma.XOR<Prisma.ClientCreateInput, Prisma.ClientUncheckedCreateInput>;
};
/**
 * Client createMany
 */
export type ClientCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to create many Clients.
     */
    data: Prisma.ClientCreateManyInput | Prisma.ClientCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * Client createManyAndReturn
 */
export type ClientCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Client
     */
    select?: Prisma.ClientSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the Client
     */
    omit?: Prisma.ClientOmit<ExtArgs> | null;
    /**
     * The data used to create many Clients.
     */
    data: Prisma.ClientCreateManyInput | Prisma.ClientCreateManyInput[];
    skipDuplicates?: boolean;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ClientIncludeCreateManyAndReturn<ExtArgs> | null;
};
/**
 * Client update
 */
export type ClientUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The data needed to update a Client.
     */
    data: Prisma.XOR<Prisma.ClientUpdateInput, Prisma.ClientUncheckedUpdateInput>;
    /**
     * Choose, which Client to update.
     */
    where: Prisma.ClientWhereUniqueInput;
};
/**
 * Client updateMany
 */
export type ClientUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to update Clients.
     */
    data: Prisma.XOR<Prisma.ClientUpdateManyMutationInput, Prisma.ClientUncheckedUpdateManyInput>;
    /**
     * Filter which Clients to update
     */
    where?: Prisma.ClientWhereInput;
    /**
     * Limit how many Clients to update.
     */
    limit?: number;
};
/**
 * Client updateManyAndReturn
 */
export type ClientUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Client
     */
    select?: Prisma.ClientSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the Client
     */
    omit?: Prisma.ClientOmit<ExtArgs> | null;
    /**
     * The data used to update Clients.
     */
    data: Prisma.XOR<Prisma.ClientUpdateManyMutationInput, Prisma.ClientUncheckedUpdateManyInput>;
    /**
     * Filter which Clients to update
     */
    where?: Prisma.ClientWhereInput;
    /**
     * Limit how many Clients to update.
     */
    limit?: number;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ClientIncludeUpdateManyAndReturn<ExtArgs> | null;
};
/**
 * Client upsert
 */
export type ClientUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The filter to search for the Client to update in case it exists.
     */
    where: Prisma.ClientWhereUniqueInput;
    /**
     * In case the Client found by the `where` argument doesn't exist, create a new Client with this data.
     */
    create: Prisma.XOR<Prisma.ClientCreateInput, Prisma.ClientUncheckedCreateInput>;
    /**
     * In case the Client was found with the provided `where` argument, update it with this data.
     */
    update: Prisma.XOR<Prisma.ClientUpdateInput, Prisma.ClientUncheckedUpdateInput>;
};
/**
 * Client delete
 */
export type ClientDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter which Client to delete.
     */
    where: Prisma.ClientWhereUniqueInput;
};
/**
 * Client deleteMany
 */
export type ClientDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which Clients to delete
     */
    where?: Prisma.ClientWhereInput;
    /**
     * Limit how many Clients to delete.
     */
    limit?: number;
};
/**
 * Client.segment
 */
export type Client$segmentArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    where?: Prisma.SegmentWhereInput;
};
/**
 * Client.messages
 */
export type Client$messagesArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Message
     */
    select?: Prisma.MessageSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Message
     */
    omit?: Prisma.MessageOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.MessageInclude<ExtArgs> | null;
    where?: Prisma.MessageWhereInput;
    orderBy?: Prisma.MessageOrderByWithRelationInput | Prisma.MessageOrderByWithRelationInput[];
    cursor?: Prisma.MessageWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.MessageScalarFieldEnum | Prisma.MessageScalarFieldEnum[];
};
/**
 * Client.tags
 */
export type Client$tagsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Tag
     */
    select?: Prisma.TagSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Tag
     */
    omit?: Prisma.TagOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.TagInclude<ExtArgs> | null;
    where?: Prisma.TagWhereInput;
    orderBy?: Prisma.TagOrderByWithRelationInput | Prisma.TagOrderByWithRelationInput[];
    cursor?: Prisma.TagWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.TagScalarFieldEnum | Prisma.TagScalarFieldEnum[];
};
/**
 * Client.tasks
 */
export type Client$tasksArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Task
     */
    select?: Prisma.TaskSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Task
     */
    omit?: Prisma.TaskOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.TaskInclude<ExtArgs> | null;
    where?: Prisma.TaskWhereInput;
    orderBy?: Prisma.TaskOrderByWithRelationInput | Prisma.TaskOrderByWithRelationInput[];
    cursor?: Prisma.TaskWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.TaskScalarFieldEnum | Prisma.TaskScalarFieldEnum[];
};
/**
 * Client.orders
 */
export type Client$ordersArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Order
     */
    select?: Prisma.OrderSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Order
     */
    omit?: Prisma.OrderOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.OrderInclude<ExtArgs> | null;
    where?: Prisma.OrderWhereInput;
    orderBy?: Prisma.OrderOrderByWithRelationInput | Prisma.OrderOrderByWithRelationInput[];
    cursor?: Prisma.OrderWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.OrderScalarFieldEnum | Prisma.OrderScalarFieldEnum[];
};
/**
 * Client.reservations
 */
export type Client$reservationsArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Reservation
     */
    select?: Prisma.ReservationSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Reservation
     */
    omit?: Prisma.ReservationOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ReservationInclude<ExtArgs> | null;
    where?: Prisma.ReservationWhereInput;
    orderBy?: Prisma.ReservationOrderByWithRelationInput | Prisma.ReservationOrderByWithRelationInput[];
    cursor?: Prisma.ReservationWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.ReservationScalarFieldEnum | Prisma.ReservationScalarFieldEnum[];
};
/**
 * Client without action
 */
export type ClientDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
};
export {};
//# sourceMappingURL=Client.d.ts.map