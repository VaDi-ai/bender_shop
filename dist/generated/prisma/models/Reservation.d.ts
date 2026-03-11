import type * as runtime from "@prisma/client/runtime/client";
import type * as $Enums from "../enums";
import type * as Prisma from "../internal/prismaNamespace";
/**
 * Model Reservation
 *
 */
export type ReservationModel = runtime.Types.Result.DefaultSelection<Prisma.$ReservationPayload>;
export type AggregateReservation = {
    _count: ReservationCountAggregateOutputType | null;
    _avg: ReservationAvgAggregateOutputType | null;
    _sum: ReservationSumAggregateOutputType | null;
    _min: ReservationMinAggregateOutputType | null;
    _max: ReservationMaxAggregateOutputType | null;
};
export type ReservationAvgAggregateOutputType = {
    id: number | null;
    clientId: number | null;
    productId: number | null;
    quantity: number | null;
};
export type ReservationSumAggregateOutputType = {
    id: number | null;
    clientId: number | null;
    productId: number | null;
    quantity: number | null;
};
export type ReservationMinAggregateOutputType = {
    id: number | null;
    clientId: number | null;
    productId: number | null;
    quantity: number | null;
    status: $Enums.ReservationStatus | null;
    comment: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
};
export type ReservationMaxAggregateOutputType = {
    id: number | null;
    clientId: number | null;
    productId: number | null;
    quantity: number | null;
    status: $Enums.ReservationStatus | null;
    comment: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
};
export type ReservationCountAggregateOutputType = {
    id: number;
    clientId: number;
    productId: number;
    quantity: number;
    status: number;
    comment: number;
    createdAt: number;
    updatedAt: number;
    _all: number;
};
export type ReservationAvgAggregateInputType = {
    id?: true;
    clientId?: true;
    productId?: true;
    quantity?: true;
};
export type ReservationSumAggregateInputType = {
    id?: true;
    clientId?: true;
    productId?: true;
    quantity?: true;
};
export type ReservationMinAggregateInputType = {
    id?: true;
    clientId?: true;
    productId?: true;
    quantity?: true;
    status?: true;
    comment?: true;
    createdAt?: true;
    updatedAt?: true;
};
export type ReservationMaxAggregateInputType = {
    id?: true;
    clientId?: true;
    productId?: true;
    quantity?: true;
    status?: true;
    comment?: true;
    createdAt?: true;
    updatedAt?: true;
};
export type ReservationCountAggregateInputType = {
    id?: true;
    clientId?: true;
    productId?: true;
    quantity?: true;
    status?: true;
    comment?: true;
    createdAt?: true;
    updatedAt?: true;
    _all?: true;
};
export type ReservationAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which Reservation to aggregate.
     */
    where?: Prisma.ReservationWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Reservations to fetch.
     */
    orderBy?: Prisma.ReservationOrderByWithRelationInput | Prisma.ReservationOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: Prisma.ReservationWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Reservations from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Reservations.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned Reservations
    **/
    _count?: true | ReservationCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to average
    **/
    _avg?: ReservationAvgAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to sum
    **/
    _sum?: ReservationSumAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
    **/
    _min?: ReservationMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
    **/
    _max?: ReservationMaxAggregateInputType;
};
export type GetReservationAggregateType<T extends ReservationAggregateArgs> = {
    [P in keyof T & keyof AggregateReservation]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateReservation[P]> : Prisma.GetScalarType<T[P], AggregateReservation[P]>;
};
export type ReservationGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.ReservationWhereInput;
    orderBy?: Prisma.ReservationOrderByWithAggregationInput | Prisma.ReservationOrderByWithAggregationInput[];
    by: Prisma.ReservationScalarFieldEnum[] | Prisma.ReservationScalarFieldEnum;
    having?: Prisma.ReservationScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: ReservationCountAggregateInputType | true;
    _avg?: ReservationAvgAggregateInputType;
    _sum?: ReservationSumAggregateInputType;
    _min?: ReservationMinAggregateInputType;
    _max?: ReservationMaxAggregateInputType;
};
export type ReservationGroupByOutputType = {
    id: number;
    clientId: number;
    productId: number;
    quantity: number;
    status: $Enums.ReservationStatus;
    comment: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count: ReservationCountAggregateOutputType | null;
    _avg: ReservationAvgAggregateOutputType | null;
    _sum: ReservationSumAggregateOutputType | null;
    _min: ReservationMinAggregateOutputType | null;
    _max: ReservationMaxAggregateOutputType | null;
};
type GetReservationGroupByPayload<T extends ReservationGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<ReservationGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof ReservationGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], ReservationGroupByOutputType[P]> : Prisma.GetScalarType<T[P], ReservationGroupByOutputType[P]>;
}>>;
export type ReservationWhereInput = {
    AND?: Prisma.ReservationWhereInput | Prisma.ReservationWhereInput[];
    OR?: Prisma.ReservationWhereInput[];
    NOT?: Prisma.ReservationWhereInput | Prisma.ReservationWhereInput[];
    id?: Prisma.IntFilter<"Reservation"> | number;
    clientId?: Prisma.IntFilter<"Reservation"> | number;
    productId?: Prisma.IntFilter<"Reservation"> | number;
    quantity?: Prisma.IntFilter<"Reservation"> | number;
    status?: Prisma.EnumReservationStatusFilter<"Reservation"> | $Enums.ReservationStatus;
    comment?: Prisma.StringNullableFilter<"Reservation"> | string | null;
    createdAt?: Prisma.DateTimeFilter<"Reservation"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"Reservation"> | Date | string;
    client?: Prisma.XOR<Prisma.ClientScalarRelationFilter, Prisma.ClientWhereInput>;
    product?: Prisma.XOR<Prisma.ProductScalarRelationFilter, Prisma.ProductWhereInput>;
};
export type ReservationOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    clientId?: Prisma.SortOrder;
    productId?: Prisma.SortOrder;
    quantity?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    comment?: Prisma.SortOrderInput | Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    client?: Prisma.ClientOrderByWithRelationInput;
    product?: Prisma.ProductOrderByWithRelationInput;
};
export type ReservationWhereUniqueInput = Prisma.AtLeast<{
    id?: number;
    AND?: Prisma.ReservationWhereInput | Prisma.ReservationWhereInput[];
    OR?: Prisma.ReservationWhereInput[];
    NOT?: Prisma.ReservationWhereInput | Prisma.ReservationWhereInput[];
    clientId?: Prisma.IntFilter<"Reservation"> | number;
    productId?: Prisma.IntFilter<"Reservation"> | number;
    quantity?: Prisma.IntFilter<"Reservation"> | number;
    status?: Prisma.EnumReservationStatusFilter<"Reservation"> | $Enums.ReservationStatus;
    comment?: Prisma.StringNullableFilter<"Reservation"> | string | null;
    createdAt?: Prisma.DateTimeFilter<"Reservation"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"Reservation"> | Date | string;
    client?: Prisma.XOR<Prisma.ClientScalarRelationFilter, Prisma.ClientWhereInput>;
    product?: Prisma.XOR<Prisma.ProductScalarRelationFilter, Prisma.ProductWhereInput>;
}, "id">;
export type ReservationOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    clientId?: Prisma.SortOrder;
    productId?: Prisma.SortOrder;
    quantity?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    comment?: Prisma.SortOrderInput | Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    _count?: Prisma.ReservationCountOrderByAggregateInput;
    _avg?: Prisma.ReservationAvgOrderByAggregateInput;
    _max?: Prisma.ReservationMaxOrderByAggregateInput;
    _min?: Prisma.ReservationMinOrderByAggregateInput;
    _sum?: Prisma.ReservationSumOrderByAggregateInput;
};
export type ReservationScalarWhereWithAggregatesInput = {
    AND?: Prisma.ReservationScalarWhereWithAggregatesInput | Prisma.ReservationScalarWhereWithAggregatesInput[];
    OR?: Prisma.ReservationScalarWhereWithAggregatesInput[];
    NOT?: Prisma.ReservationScalarWhereWithAggregatesInput | Prisma.ReservationScalarWhereWithAggregatesInput[];
    id?: Prisma.IntWithAggregatesFilter<"Reservation"> | number;
    clientId?: Prisma.IntWithAggregatesFilter<"Reservation"> | number;
    productId?: Prisma.IntWithAggregatesFilter<"Reservation"> | number;
    quantity?: Prisma.IntWithAggregatesFilter<"Reservation"> | number;
    status?: Prisma.EnumReservationStatusWithAggregatesFilter<"Reservation"> | $Enums.ReservationStatus;
    comment?: Prisma.StringNullableWithAggregatesFilter<"Reservation"> | string | null;
    createdAt?: Prisma.DateTimeWithAggregatesFilter<"Reservation"> | Date | string;
    updatedAt?: Prisma.DateTimeWithAggregatesFilter<"Reservation"> | Date | string;
};
export type ReservationCreateInput = {
    quantity: number;
    status?: $Enums.ReservationStatus;
    comment?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    client: Prisma.ClientCreateNestedOneWithoutReservationsInput;
    product: Prisma.ProductCreateNestedOneWithoutReservationsInput;
};
export type ReservationUncheckedCreateInput = {
    id?: number;
    clientId: number;
    productId: number;
    quantity: number;
    status?: $Enums.ReservationStatus;
    comment?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type ReservationUpdateInput = {
    quantity?: Prisma.IntFieldUpdateOperationsInput | number;
    status?: Prisma.EnumReservationStatusFieldUpdateOperationsInput | $Enums.ReservationStatus;
    comment?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    client?: Prisma.ClientUpdateOneRequiredWithoutReservationsNestedInput;
    product?: Prisma.ProductUpdateOneRequiredWithoutReservationsNestedInput;
};
export type ReservationUncheckedUpdateInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    clientId?: Prisma.IntFieldUpdateOperationsInput | number;
    productId?: Prisma.IntFieldUpdateOperationsInput | number;
    quantity?: Prisma.IntFieldUpdateOperationsInput | number;
    status?: Prisma.EnumReservationStatusFieldUpdateOperationsInput | $Enums.ReservationStatus;
    comment?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type ReservationCreateManyInput = {
    id?: number;
    clientId: number;
    productId: number;
    quantity: number;
    status?: $Enums.ReservationStatus;
    comment?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type ReservationUpdateManyMutationInput = {
    quantity?: Prisma.IntFieldUpdateOperationsInput | number;
    status?: Prisma.EnumReservationStatusFieldUpdateOperationsInput | $Enums.ReservationStatus;
    comment?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type ReservationUncheckedUpdateManyInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    clientId?: Prisma.IntFieldUpdateOperationsInput | number;
    productId?: Prisma.IntFieldUpdateOperationsInput | number;
    quantity?: Prisma.IntFieldUpdateOperationsInput | number;
    status?: Prisma.EnumReservationStatusFieldUpdateOperationsInput | $Enums.ReservationStatus;
    comment?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type ReservationListRelationFilter = {
    every?: Prisma.ReservationWhereInput;
    some?: Prisma.ReservationWhereInput;
    none?: Prisma.ReservationWhereInput;
};
export type ReservationOrderByRelationAggregateInput = {
    _count?: Prisma.SortOrder;
};
export type ReservationCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    clientId?: Prisma.SortOrder;
    productId?: Prisma.SortOrder;
    quantity?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    comment?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type ReservationAvgOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    clientId?: Prisma.SortOrder;
    productId?: Prisma.SortOrder;
    quantity?: Prisma.SortOrder;
};
export type ReservationMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    clientId?: Prisma.SortOrder;
    productId?: Prisma.SortOrder;
    quantity?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    comment?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type ReservationMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    clientId?: Prisma.SortOrder;
    productId?: Prisma.SortOrder;
    quantity?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    comment?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
};
export type ReservationSumOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    clientId?: Prisma.SortOrder;
    productId?: Prisma.SortOrder;
    quantity?: Prisma.SortOrder;
};
export type ReservationCreateNestedManyWithoutClientInput = {
    create?: Prisma.XOR<Prisma.ReservationCreateWithoutClientInput, Prisma.ReservationUncheckedCreateWithoutClientInput> | Prisma.ReservationCreateWithoutClientInput[] | Prisma.ReservationUncheckedCreateWithoutClientInput[];
    connectOrCreate?: Prisma.ReservationCreateOrConnectWithoutClientInput | Prisma.ReservationCreateOrConnectWithoutClientInput[];
    createMany?: Prisma.ReservationCreateManyClientInputEnvelope;
    connect?: Prisma.ReservationWhereUniqueInput | Prisma.ReservationWhereUniqueInput[];
};
export type ReservationUncheckedCreateNestedManyWithoutClientInput = {
    create?: Prisma.XOR<Prisma.ReservationCreateWithoutClientInput, Prisma.ReservationUncheckedCreateWithoutClientInput> | Prisma.ReservationCreateWithoutClientInput[] | Prisma.ReservationUncheckedCreateWithoutClientInput[];
    connectOrCreate?: Prisma.ReservationCreateOrConnectWithoutClientInput | Prisma.ReservationCreateOrConnectWithoutClientInput[];
    createMany?: Prisma.ReservationCreateManyClientInputEnvelope;
    connect?: Prisma.ReservationWhereUniqueInput | Prisma.ReservationWhereUniqueInput[];
};
export type ReservationUpdateManyWithoutClientNestedInput = {
    create?: Prisma.XOR<Prisma.ReservationCreateWithoutClientInput, Prisma.ReservationUncheckedCreateWithoutClientInput> | Prisma.ReservationCreateWithoutClientInput[] | Prisma.ReservationUncheckedCreateWithoutClientInput[];
    connectOrCreate?: Prisma.ReservationCreateOrConnectWithoutClientInput | Prisma.ReservationCreateOrConnectWithoutClientInput[];
    upsert?: Prisma.ReservationUpsertWithWhereUniqueWithoutClientInput | Prisma.ReservationUpsertWithWhereUniqueWithoutClientInput[];
    createMany?: Prisma.ReservationCreateManyClientInputEnvelope;
    set?: Prisma.ReservationWhereUniqueInput | Prisma.ReservationWhereUniqueInput[];
    disconnect?: Prisma.ReservationWhereUniqueInput | Prisma.ReservationWhereUniqueInput[];
    delete?: Prisma.ReservationWhereUniqueInput | Prisma.ReservationWhereUniqueInput[];
    connect?: Prisma.ReservationWhereUniqueInput | Prisma.ReservationWhereUniqueInput[];
    update?: Prisma.ReservationUpdateWithWhereUniqueWithoutClientInput | Prisma.ReservationUpdateWithWhereUniqueWithoutClientInput[];
    updateMany?: Prisma.ReservationUpdateManyWithWhereWithoutClientInput | Prisma.ReservationUpdateManyWithWhereWithoutClientInput[];
    deleteMany?: Prisma.ReservationScalarWhereInput | Prisma.ReservationScalarWhereInput[];
};
export type ReservationUncheckedUpdateManyWithoutClientNestedInput = {
    create?: Prisma.XOR<Prisma.ReservationCreateWithoutClientInput, Prisma.ReservationUncheckedCreateWithoutClientInput> | Prisma.ReservationCreateWithoutClientInput[] | Prisma.ReservationUncheckedCreateWithoutClientInput[];
    connectOrCreate?: Prisma.ReservationCreateOrConnectWithoutClientInput | Prisma.ReservationCreateOrConnectWithoutClientInput[];
    upsert?: Prisma.ReservationUpsertWithWhereUniqueWithoutClientInput | Prisma.ReservationUpsertWithWhereUniqueWithoutClientInput[];
    createMany?: Prisma.ReservationCreateManyClientInputEnvelope;
    set?: Prisma.ReservationWhereUniqueInput | Prisma.ReservationWhereUniqueInput[];
    disconnect?: Prisma.ReservationWhereUniqueInput | Prisma.ReservationWhereUniqueInput[];
    delete?: Prisma.ReservationWhereUniqueInput | Prisma.ReservationWhereUniqueInput[];
    connect?: Prisma.ReservationWhereUniqueInput | Prisma.ReservationWhereUniqueInput[];
    update?: Prisma.ReservationUpdateWithWhereUniqueWithoutClientInput | Prisma.ReservationUpdateWithWhereUniqueWithoutClientInput[];
    updateMany?: Prisma.ReservationUpdateManyWithWhereWithoutClientInput | Prisma.ReservationUpdateManyWithWhereWithoutClientInput[];
    deleteMany?: Prisma.ReservationScalarWhereInput | Prisma.ReservationScalarWhereInput[];
};
export type ReservationCreateNestedManyWithoutProductInput = {
    create?: Prisma.XOR<Prisma.ReservationCreateWithoutProductInput, Prisma.ReservationUncheckedCreateWithoutProductInput> | Prisma.ReservationCreateWithoutProductInput[] | Prisma.ReservationUncheckedCreateWithoutProductInput[];
    connectOrCreate?: Prisma.ReservationCreateOrConnectWithoutProductInput | Prisma.ReservationCreateOrConnectWithoutProductInput[];
    createMany?: Prisma.ReservationCreateManyProductInputEnvelope;
    connect?: Prisma.ReservationWhereUniqueInput | Prisma.ReservationWhereUniqueInput[];
};
export type ReservationUncheckedCreateNestedManyWithoutProductInput = {
    create?: Prisma.XOR<Prisma.ReservationCreateWithoutProductInput, Prisma.ReservationUncheckedCreateWithoutProductInput> | Prisma.ReservationCreateWithoutProductInput[] | Prisma.ReservationUncheckedCreateWithoutProductInput[];
    connectOrCreate?: Prisma.ReservationCreateOrConnectWithoutProductInput | Prisma.ReservationCreateOrConnectWithoutProductInput[];
    createMany?: Prisma.ReservationCreateManyProductInputEnvelope;
    connect?: Prisma.ReservationWhereUniqueInput | Prisma.ReservationWhereUniqueInput[];
};
export type ReservationUpdateManyWithoutProductNestedInput = {
    create?: Prisma.XOR<Prisma.ReservationCreateWithoutProductInput, Prisma.ReservationUncheckedCreateWithoutProductInput> | Prisma.ReservationCreateWithoutProductInput[] | Prisma.ReservationUncheckedCreateWithoutProductInput[];
    connectOrCreate?: Prisma.ReservationCreateOrConnectWithoutProductInput | Prisma.ReservationCreateOrConnectWithoutProductInput[];
    upsert?: Prisma.ReservationUpsertWithWhereUniqueWithoutProductInput | Prisma.ReservationUpsertWithWhereUniqueWithoutProductInput[];
    createMany?: Prisma.ReservationCreateManyProductInputEnvelope;
    set?: Prisma.ReservationWhereUniqueInput | Prisma.ReservationWhereUniqueInput[];
    disconnect?: Prisma.ReservationWhereUniqueInput | Prisma.ReservationWhereUniqueInput[];
    delete?: Prisma.ReservationWhereUniqueInput | Prisma.ReservationWhereUniqueInput[];
    connect?: Prisma.ReservationWhereUniqueInput | Prisma.ReservationWhereUniqueInput[];
    update?: Prisma.ReservationUpdateWithWhereUniqueWithoutProductInput | Prisma.ReservationUpdateWithWhereUniqueWithoutProductInput[];
    updateMany?: Prisma.ReservationUpdateManyWithWhereWithoutProductInput | Prisma.ReservationUpdateManyWithWhereWithoutProductInput[];
    deleteMany?: Prisma.ReservationScalarWhereInput | Prisma.ReservationScalarWhereInput[];
};
export type ReservationUncheckedUpdateManyWithoutProductNestedInput = {
    create?: Prisma.XOR<Prisma.ReservationCreateWithoutProductInput, Prisma.ReservationUncheckedCreateWithoutProductInput> | Prisma.ReservationCreateWithoutProductInput[] | Prisma.ReservationUncheckedCreateWithoutProductInput[];
    connectOrCreate?: Prisma.ReservationCreateOrConnectWithoutProductInput | Prisma.ReservationCreateOrConnectWithoutProductInput[];
    upsert?: Prisma.ReservationUpsertWithWhereUniqueWithoutProductInput | Prisma.ReservationUpsertWithWhereUniqueWithoutProductInput[];
    createMany?: Prisma.ReservationCreateManyProductInputEnvelope;
    set?: Prisma.ReservationWhereUniqueInput | Prisma.ReservationWhereUniqueInput[];
    disconnect?: Prisma.ReservationWhereUniqueInput | Prisma.ReservationWhereUniqueInput[];
    delete?: Prisma.ReservationWhereUniqueInput | Prisma.ReservationWhereUniqueInput[];
    connect?: Prisma.ReservationWhereUniqueInput | Prisma.ReservationWhereUniqueInput[];
    update?: Prisma.ReservationUpdateWithWhereUniqueWithoutProductInput | Prisma.ReservationUpdateWithWhereUniqueWithoutProductInput[];
    updateMany?: Prisma.ReservationUpdateManyWithWhereWithoutProductInput | Prisma.ReservationUpdateManyWithWhereWithoutProductInput[];
    deleteMany?: Prisma.ReservationScalarWhereInput | Prisma.ReservationScalarWhereInput[];
};
export type EnumReservationStatusFieldUpdateOperationsInput = {
    set?: $Enums.ReservationStatus;
};
export type ReservationCreateWithoutClientInput = {
    quantity: number;
    status?: $Enums.ReservationStatus;
    comment?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    product: Prisma.ProductCreateNestedOneWithoutReservationsInput;
};
export type ReservationUncheckedCreateWithoutClientInput = {
    id?: number;
    productId: number;
    quantity: number;
    status?: $Enums.ReservationStatus;
    comment?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type ReservationCreateOrConnectWithoutClientInput = {
    where: Prisma.ReservationWhereUniqueInput;
    create: Prisma.XOR<Prisma.ReservationCreateWithoutClientInput, Prisma.ReservationUncheckedCreateWithoutClientInput>;
};
export type ReservationCreateManyClientInputEnvelope = {
    data: Prisma.ReservationCreateManyClientInput | Prisma.ReservationCreateManyClientInput[];
    skipDuplicates?: boolean;
};
export type ReservationUpsertWithWhereUniqueWithoutClientInput = {
    where: Prisma.ReservationWhereUniqueInput;
    update: Prisma.XOR<Prisma.ReservationUpdateWithoutClientInput, Prisma.ReservationUncheckedUpdateWithoutClientInput>;
    create: Prisma.XOR<Prisma.ReservationCreateWithoutClientInput, Prisma.ReservationUncheckedCreateWithoutClientInput>;
};
export type ReservationUpdateWithWhereUniqueWithoutClientInput = {
    where: Prisma.ReservationWhereUniqueInput;
    data: Prisma.XOR<Prisma.ReservationUpdateWithoutClientInput, Prisma.ReservationUncheckedUpdateWithoutClientInput>;
};
export type ReservationUpdateManyWithWhereWithoutClientInput = {
    where: Prisma.ReservationScalarWhereInput;
    data: Prisma.XOR<Prisma.ReservationUpdateManyMutationInput, Prisma.ReservationUncheckedUpdateManyWithoutClientInput>;
};
export type ReservationScalarWhereInput = {
    AND?: Prisma.ReservationScalarWhereInput | Prisma.ReservationScalarWhereInput[];
    OR?: Prisma.ReservationScalarWhereInput[];
    NOT?: Prisma.ReservationScalarWhereInput | Prisma.ReservationScalarWhereInput[];
    id?: Prisma.IntFilter<"Reservation"> | number;
    clientId?: Prisma.IntFilter<"Reservation"> | number;
    productId?: Prisma.IntFilter<"Reservation"> | number;
    quantity?: Prisma.IntFilter<"Reservation"> | number;
    status?: Prisma.EnumReservationStatusFilter<"Reservation"> | $Enums.ReservationStatus;
    comment?: Prisma.StringNullableFilter<"Reservation"> | string | null;
    createdAt?: Prisma.DateTimeFilter<"Reservation"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"Reservation"> | Date | string;
};
export type ReservationCreateWithoutProductInput = {
    quantity: number;
    status?: $Enums.ReservationStatus;
    comment?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    client: Prisma.ClientCreateNestedOneWithoutReservationsInput;
};
export type ReservationUncheckedCreateWithoutProductInput = {
    id?: number;
    clientId: number;
    quantity: number;
    status?: $Enums.ReservationStatus;
    comment?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type ReservationCreateOrConnectWithoutProductInput = {
    where: Prisma.ReservationWhereUniqueInput;
    create: Prisma.XOR<Prisma.ReservationCreateWithoutProductInput, Prisma.ReservationUncheckedCreateWithoutProductInput>;
};
export type ReservationCreateManyProductInputEnvelope = {
    data: Prisma.ReservationCreateManyProductInput | Prisma.ReservationCreateManyProductInput[];
    skipDuplicates?: boolean;
};
export type ReservationUpsertWithWhereUniqueWithoutProductInput = {
    where: Prisma.ReservationWhereUniqueInput;
    update: Prisma.XOR<Prisma.ReservationUpdateWithoutProductInput, Prisma.ReservationUncheckedUpdateWithoutProductInput>;
    create: Prisma.XOR<Prisma.ReservationCreateWithoutProductInput, Prisma.ReservationUncheckedCreateWithoutProductInput>;
};
export type ReservationUpdateWithWhereUniqueWithoutProductInput = {
    where: Prisma.ReservationWhereUniqueInput;
    data: Prisma.XOR<Prisma.ReservationUpdateWithoutProductInput, Prisma.ReservationUncheckedUpdateWithoutProductInput>;
};
export type ReservationUpdateManyWithWhereWithoutProductInput = {
    where: Prisma.ReservationScalarWhereInput;
    data: Prisma.XOR<Prisma.ReservationUpdateManyMutationInput, Prisma.ReservationUncheckedUpdateManyWithoutProductInput>;
};
export type ReservationCreateManyClientInput = {
    id?: number;
    productId: number;
    quantity: number;
    status?: $Enums.ReservationStatus;
    comment?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type ReservationUpdateWithoutClientInput = {
    quantity?: Prisma.IntFieldUpdateOperationsInput | number;
    status?: Prisma.EnumReservationStatusFieldUpdateOperationsInput | $Enums.ReservationStatus;
    comment?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    product?: Prisma.ProductUpdateOneRequiredWithoutReservationsNestedInput;
};
export type ReservationUncheckedUpdateWithoutClientInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    productId?: Prisma.IntFieldUpdateOperationsInput | number;
    quantity?: Prisma.IntFieldUpdateOperationsInput | number;
    status?: Prisma.EnumReservationStatusFieldUpdateOperationsInput | $Enums.ReservationStatus;
    comment?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type ReservationUncheckedUpdateManyWithoutClientInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    productId?: Prisma.IntFieldUpdateOperationsInput | number;
    quantity?: Prisma.IntFieldUpdateOperationsInput | number;
    status?: Prisma.EnumReservationStatusFieldUpdateOperationsInput | $Enums.ReservationStatus;
    comment?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type ReservationCreateManyProductInput = {
    id?: number;
    clientId: number;
    quantity: number;
    status?: $Enums.ReservationStatus;
    comment?: string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
};
export type ReservationUpdateWithoutProductInput = {
    quantity?: Prisma.IntFieldUpdateOperationsInput | number;
    status?: Prisma.EnumReservationStatusFieldUpdateOperationsInput | $Enums.ReservationStatus;
    comment?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    client?: Prisma.ClientUpdateOneRequiredWithoutReservationsNestedInput;
};
export type ReservationUncheckedUpdateWithoutProductInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    clientId?: Prisma.IntFieldUpdateOperationsInput | number;
    quantity?: Prisma.IntFieldUpdateOperationsInput | number;
    status?: Prisma.EnumReservationStatusFieldUpdateOperationsInput | $Enums.ReservationStatus;
    comment?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type ReservationUncheckedUpdateManyWithoutProductInput = {
    id?: Prisma.IntFieldUpdateOperationsInput | number;
    clientId?: Prisma.IntFieldUpdateOperationsInput | number;
    quantity?: Prisma.IntFieldUpdateOperationsInput | number;
    status?: Prisma.EnumReservationStatusFieldUpdateOperationsInput | $Enums.ReservationStatus;
    comment?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type ReservationSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    clientId?: boolean;
    productId?: boolean;
    quantity?: boolean;
    status?: boolean;
    comment?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    client?: boolean | Prisma.ClientDefaultArgs<ExtArgs>;
    product?: boolean | Prisma.ProductDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["reservation"]>;
export type ReservationSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    clientId?: boolean;
    productId?: boolean;
    quantity?: boolean;
    status?: boolean;
    comment?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    client?: boolean | Prisma.ClientDefaultArgs<ExtArgs>;
    product?: boolean | Prisma.ProductDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["reservation"]>;
export type ReservationSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    clientId?: boolean;
    productId?: boolean;
    quantity?: boolean;
    status?: boolean;
    comment?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    client?: boolean | Prisma.ClientDefaultArgs<ExtArgs>;
    product?: boolean | Prisma.ProductDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["reservation"]>;
export type ReservationSelectScalar = {
    id?: boolean;
    clientId?: boolean;
    productId?: boolean;
    quantity?: boolean;
    status?: boolean;
    comment?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
};
export type ReservationOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "clientId" | "productId" | "quantity" | "status" | "comment" | "createdAt" | "updatedAt", ExtArgs["result"]["reservation"]>;
export type ReservationInclude<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    client?: boolean | Prisma.ClientDefaultArgs<ExtArgs>;
    product?: boolean | Prisma.ProductDefaultArgs<ExtArgs>;
};
export type ReservationIncludeCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    client?: boolean | Prisma.ClientDefaultArgs<ExtArgs>;
    product?: boolean | Prisma.ProductDefaultArgs<ExtArgs>;
};
export type ReservationIncludeUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    client?: boolean | Prisma.ClientDefaultArgs<ExtArgs>;
    product?: boolean | Prisma.ProductDefaultArgs<ExtArgs>;
};
export type $ReservationPayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "Reservation";
    objects: {
        client: Prisma.$ClientPayload<ExtArgs>;
        product: Prisma.$ProductPayload<ExtArgs>;
    };
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: number;
        clientId: number;
        productId: number;
        quantity: number;
        status: $Enums.ReservationStatus;
        comment: string | null;
        createdAt: Date;
        updatedAt: Date;
    }, ExtArgs["result"]["reservation"]>;
    composites: {};
};
export type ReservationGetPayload<S extends boolean | null | undefined | ReservationDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$ReservationPayload, S>;
export type ReservationCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<ReservationFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: ReservationCountAggregateInputType | true;
};
export interface ReservationDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['Reservation'];
        meta: {
            name: 'Reservation';
        };
    };
    /**
     * Find zero or one Reservation that matches the filter.
     * @param {ReservationFindUniqueArgs} args - Arguments to find a Reservation
     * @example
     * // Get one Reservation
     * const reservation = await prisma.reservation.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ReservationFindUniqueArgs>(args: Prisma.SelectSubset<T, ReservationFindUniqueArgs<ExtArgs>>): Prisma.Prisma__ReservationClient<runtime.Types.Result.GetResult<Prisma.$ReservationPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find one Reservation that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {ReservationFindUniqueOrThrowArgs} args - Arguments to find a Reservation
     * @example
     * // Get one Reservation
     * const reservation = await prisma.reservation.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ReservationFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, ReservationFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__ReservationClient<runtime.Types.Result.GetResult<Prisma.$ReservationPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first Reservation that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ReservationFindFirstArgs} args - Arguments to find a Reservation
     * @example
     * // Get one Reservation
     * const reservation = await prisma.reservation.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ReservationFindFirstArgs>(args?: Prisma.SelectSubset<T, ReservationFindFirstArgs<ExtArgs>>): Prisma.Prisma__ReservationClient<runtime.Types.Result.GetResult<Prisma.$ReservationPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    /**
     * Find the first Reservation that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ReservationFindFirstOrThrowArgs} args - Arguments to find a Reservation
     * @example
     * // Get one Reservation
     * const reservation = await prisma.reservation.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ReservationFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, ReservationFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__ReservationClient<runtime.Types.Result.GetResult<Prisma.$ReservationPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Find zero or more Reservations that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ReservationFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Reservations
     * const reservations = await prisma.reservation.findMany()
     *
     * // Get first 10 Reservations
     * const reservations = await prisma.reservation.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const reservationWithIdOnly = await prisma.reservation.findMany({ select: { id: true } })
     *
     */
    findMany<T extends ReservationFindManyArgs>(args?: Prisma.SelectSubset<T, ReservationFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ReservationPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    /**
     * Create a Reservation.
     * @param {ReservationCreateArgs} args - Arguments to create a Reservation.
     * @example
     * // Create one Reservation
     * const Reservation = await prisma.reservation.create({
     *   data: {
     *     // ... data to create a Reservation
     *   }
     * })
     *
     */
    create<T extends ReservationCreateArgs>(args: Prisma.SelectSubset<T, ReservationCreateArgs<ExtArgs>>): Prisma.Prisma__ReservationClient<runtime.Types.Result.GetResult<Prisma.$ReservationPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Create many Reservations.
     * @param {ReservationCreateManyArgs} args - Arguments to create many Reservations.
     * @example
     * // Create many Reservations
     * const reservation = await prisma.reservation.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends ReservationCreateManyArgs>(args?: Prisma.SelectSubset<T, ReservationCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Create many Reservations and returns the data saved in the database.
     * @param {ReservationCreateManyAndReturnArgs} args - Arguments to create many Reservations.
     * @example
     * // Create many Reservations
     * const reservation = await prisma.reservation.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many Reservations and only return the `id`
     * const reservationWithIdOnly = await prisma.reservation.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends ReservationCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, ReservationCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ReservationPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    /**
     * Delete a Reservation.
     * @param {ReservationDeleteArgs} args - Arguments to delete one Reservation.
     * @example
     * // Delete one Reservation
     * const Reservation = await prisma.reservation.delete({
     *   where: {
     *     // ... filter to delete one Reservation
     *   }
     * })
     *
     */
    delete<T extends ReservationDeleteArgs>(args: Prisma.SelectSubset<T, ReservationDeleteArgs<ExtArgs>>): Prisma.Prisma__ReservationClient<runtime.Types.Result.GetResult<Prisma.$ReservationPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Update one Reservation.
     * @param {ReservationUpdateArgs} args - Arguments to update one Reservation.
     * @example
     * // Update one Reservation
     * const reservation = await prisma.reservation.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends ReservationUpdateArgs>(args: Prisma.SelectSubset<T, ReservationUpdateArgs<ExtArgs>>): Prisma.Prisma__ReservationClient<runtime.Types.Result.GetResult<Prisma.$ReservationPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Delete zero or more Reservations.
     * @param {ReservationDeleteManyArgs} args - Arguments to filter Reservations to delete.
     * @example
     * // Delete a few Reservations
     * const { count } = await prisma.reservation.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends ReservationDeleteManyArgs>(args?: Prisma.SelectSubset<T, ReservationDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more Reservations.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ReservationUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Reservations
     * const reservation = await prisma.reservation.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends ReservationUpdateManyArgs>(args: Prisma.SelectSubset<T, ReservationUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    /**
     * Update zero or more Reservations and returns the data updated in the database.
     * @param {ReservationUpdateManyAndReturnArgs} args - Arguments to update many Reservations.
     * @example
     * // Update many Reservations
     * const reservation = await prisma.reservation.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more Reservations and only return the `id`
     * const reservationWithIdOnly = await prisma.reservation.updateManyAndReturn({
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
    updateManyAndReturn<T extends ReservationUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, ReservationUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$ReservationPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    /**
     * Create or update one Reservation.
     * @param {ReservationUpsertArgs} args - Arguments to update or create a Reservation.
     * @example
     * // Update or create a Reservation
     * const reservation = await prisma.reservation.upsert({
     *   create: {
     *     // ... data to create a Reservation
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Reservation we want to update
     *   }
     * })
     */
    upsert<T extends ReservationUpsertArgs>(args: Prisma.SelectSubset<T, ReservationUpsertArgs<ExtArgs>>): Prisma.Prisma__ReservationClient<runtime.Types.Result.GetResult<Prisma.$ReservationPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    /**
     * Count the number of Reservations.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ReservationCountArgs} args - Arguments to filter Reservations to count.
     * @example
     * // Count the number of Reservations
     * const count = await prisma.reservation.count({
     *   where: {
     *     // ... the filter for the Reservations we want to count
     *   }
     * })
    **/
    count<T extends ReservationCountArgs>(args?: Prisma.Subset<T, ReservationCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], ReservationCountAggregateOutputType> : number>;
    /**
     * Allows you to perform aggregations operations on a Reservation.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ReservationAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends ReservationAggregateArgs>(args: Prisma.Subset<T, ReservationAggregateArgs>): Prisma.PrismaPromise<GetReservationAggregateType<T>>;
    /**
     * Group by Reservation.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ReservationGroupByArgs} args - Group by arguments.
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
    groupBy<T extends ReservationGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: ReservationGroupByArgs['orderBy'];
    } : {
        orderBy?: ReservationGroupByArgs['orderBy'];
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
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, ReservationGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetReservationGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the Reservation model
     */
    readonly fields: ReservationFieldRefs;
}
/**
 * The delegate class that acts as a "Promise-like" for Reservation.
 * Why is this prefixed with `Prisma__`?
 * Because we want to prevent naming conflicts as mentioned in
 * https://github.com/prisma/prisma-client-js/issues/707
 */
export interface Prisma__ReservationClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    client<T extends Prisma.ClientDefaultArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.ClientDefaultArgs<ExtArgs>>): Prisma.Prisma__ClientClient<runtime.Types.Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>;
    product<T extends Prisma.ProductDefaultArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.ProductDefaultArgs<ExtArgs>>): Prisma.Prisma__ProductClient<runtime.Types.Result.GetResult<Prisma.$ProductPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>;
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
 * Fields of the Reservation model
 */
export interface ReservationFieldRefs {
    readonly id: Prisma.FieldRef<"Reservation", 'Int'>;
    readonly clientId: Prisma.FieldRef<"Reservation", 'Int'>;
    readonly productId: Prisma.FieldRef<"Reservation", 'Int'>;
    readonly quantity: Prisma.FieldRef<"Reservation", 'Int'>;
    readonly status: Prisma.FieldRef<"Reservation", 'ReservationStatus'>;
    readonly comment: Prisma.FieldRef<"Reservation", 'String'>;
    readonly createdAt: Prisma.FieldRef<"Reservation", 'DateTime'>;
    readonly updatedAt: Prisma.FieldRef<"Reservation", 'DateTime'>;
}
/**
 * Reservation findUnique
 */
export type ReservationFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which Reservation to fetch.
     */
    where: Prisma.ReservationWhereUniqueInput;
};
/**
 * Reservation findUniqueOrThrow
 */
export type ReservationFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which Reservation to fetch.
     */
    where: Prisma.ReservationWhereUniqueInput;
};
/**
 * Reservation findFirst
 */
export type ReservationFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which Reservation to fetch.
     */
    where?: Prisma.ReservationWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Reservations to fetch.
     */
    orderBy?: Prisma.ReservationOrderByWithRelationInput | Prisma.ReservationOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Reservations.
     */
    cursor?: Prisma.ReservationWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Reservations from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Reservations.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Reservations.
     */
    distinct?: Prisma.ReservationScalarFieldEnum | Prisma.ReservationScalarFieldEnum[];
};
/**
 * Reservation findFirstOrThrow
 */
export type ReservationFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which Reservation to fetch.
     */
    where?: Prisma.ReservationWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Reservations to fetch.
     */
    orderBy?: Prisma.ReservationOrderByWithRelationInput | Prisma.ReservationOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Reservations.
     */
    cursor?: Prisma.ReservationWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Reservations from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Reservations.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Reservations.
     */
    distinct?: Prisma.ReservationScalarFieldEnum | Prisma.ReservationScalarFieldEnum[];
};
/**
 * Reservation findMany
 */
export type ReservationFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter, which Reservations to fetch.
     */
    where?: Prisma.ReservationWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Reservations to fetch.
     */
    orderBy?: Prisma.ReservationOrderByWithRelationInput | Prisma.ReservationOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing Reservations.
     */
    cursor?: Prisma.ReservationWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Reservations from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Reservations.
     */
    skip?: number;
    distinct?: Prisma.ReservationScalarFieldEnum | Prisma.ReservationScalarFieldEnum[];
};
/**
 * Reservation create
 */
export type ReservationCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The data needed to create a Reservation.
     */
    data: Prisma.XOR<Prisma.ReservationCreateInput, Prisma.ReservationUncheckedCreateInput>;
};
/**
 * Reservation createMany
 */
export type ReservationCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to create many Reservations.
     */
    data: Prisma.ReservationCreateManyInput | Prisma.ReservationCreateManyInput[];
    skipDuplicates?: boolean;
};
/**
 * Reservation createManyAndReturn
 */
export type ReservationCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Reservation
     */
    select?: Prisma.ReservationSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the Reservation
     */
    omit?: Prisma.ReservationOmit<ExtArgs> | null;
    /**
     * The data used to create many Reservations.
     */
    data: Prisma.ReservationCreateManyInput | Prisma.ReservationCreateManyInput[];
    skipDuplicates?: boolean;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ReservationIncludeCreateManyAndReturn<ExtArgs> | null;
};
/**
 * Reservation update
 */
export type ReservationUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The data needed to update a Reservation.
     */
    data: Prisma.XOR<Prisma.ReservationUpdateInput, Prisma.ReservationUncheckedUpdateInput>;
    /**
     * Choose, which Reservation to update.
     */
    where: Prisma.ReservationWhereUniqueInput;
};
/**
 * Reservation updateMany
 */
export type ReservationUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * The data used to update Reservations.
     */
    data: Prisma.XOR<Prisma.ReservationUpdateManyMutationInput, Prisma.ReservationUncheckedUpdateManyInput>;
    /**
     * Filter which Reservations to update
     */
    where?: Prisma.ReservationWhereInput;
    /**
     * Limit how many Reservations to update.
     */
    limit?: number;
};
/**
 * Reservation updateManyAndReturn
 */
export type ReservationUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Reservation
     */
    select?: Prisma.ReservationSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the Reservation
     */
    omit?: Prisma.ReservationOmit<ExtArgs> | null;
    /**
     * The data used to update Reservations.
     */
    data: Prisma.XOR<Prisma.ReservationUpdateManyMutationInput, Prisma.ReservationUncheckedUpdateManyInput>;
    /**
     * Filter which Reservations to update
     */
    where?: Prisma.ReservationWhereInput;
    /**
     * Limit how many Reservations to update.
     */
    limit?: number;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: Prisma.ReservationIncludeUpdateManyAndReturn<ExtArgs> | null;
};
/**
 * Reservation upsert
 */
export type ReservationUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * The filter to search for the Reservation to update in case it exists.
     */
    where: Prisma.ReservationWhereUniqueInput;
    /**
     * In case the Reservation found by the `where` argument doesn't exist, create a new Reservation with this data.
     */
    create: Prisma.XOR<Prisma.ReservationCreateInput, Prisma.ReservationUncheckedCreateInput>;
    /**
     * In case the Reservation was found with the provided `where` argument, update it with this data.
     */
    update: Prisma.XOR<Prisma.ReservationUpdateInput, Prisma.ReservationUncheckedUpdateInput>;
};
/**
 * Reservation delete
 */
export type ReservationDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
    /**
     * Filter which Reservation to delete.
     */
    where: Prisma.ReservationWhereUniqueInput;
};
/**
 * Reservation deleteMany
 */
export type ReservationDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    /**
     * Filter which Reservations to delete
     */
    where?: Prisma.ReservationWhereInput;
    /**
     * Limit how many Reservations to delete.
     */
    limit?: number;
};
/**
 * Reservation without action
 */
export type ReservationDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
};
export {};
//# sourceMappingURL=Reservation.d.ts.map