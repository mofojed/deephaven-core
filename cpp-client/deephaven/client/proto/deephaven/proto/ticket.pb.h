/**
 * Copyright (c) 2016-2022 Deephaven Data Labs and Patent Pending
 */
// Generated by the protocol buffer compiler.  DO NOT EDIT!
// source: deephaven/proto/ticket.proto

#ifndef GOOGLE_PROTOBUF_INCLUDED_deephaven_2fproto_2fticket_2eproto
#define GOOGLE_PROTOBUF_INCLUDED_deephaven_2fproto_2fticket_2eproto

#include <limits>
#include <string>

#include <google/protobuf/port_def.inc>
#if PROTOBUF_VERSION < 3018000
#error This file was generated by a newer version of protoc which is
#error incompatible with your Protocol Buffer headers. Please update
#error your headers.
#endif
#if 3018000 < PROTOBUF_MIN_PROTOC_VERSION
#error This file was generated by an older version of protoc which is
#error incompatible with your Protocol Buffer headers. Please
#error regenerate this file with a newer version of protoc.
#endif

#include <google/protobuf/port_undef.inc>
#include <google/protobuf/io/coded_stream.h>
#include <google/protobuf/arena.h>
#include <google/protobuf/arenastring.h>
#include <google/protobuf/generated_message_table_driven.h>
#include <google/protobuf/generated_message_util.h>
#include <google/protobuf/metadata_lite.h>
#include <google/protobuf/generated_message_reflection.h>
#include <google/protobuf/message.h>
#include <google/protobuf/repeated_field.h>  // IWYU pragma: export
#include <google/protobuf/extension_set.h>  // IWYU pragma: export
#include <google/protobuf/unknown_field_set.h>
// @@protoc_insertion_point(includes)
#include <google/protobuf/port_def.inc>
#define PROTOBUF_INTERNAL_EXPORT_deephaven_2fproto_2fticket_2eproto
PROTOBUF_NAMESPACE_OPEN
namespace internal {
class AnyMetadata;
}  // namespace internal
PROTOBUF_NAMESPACE_CLOSE

// Internal implementation detail -- do not use these members.
struct TableStruct_deephaven_2fproto_2fticket_2eproto {
  static const ::PROTOBUF_NAMESPACE_ID::internal::ParseTableField entries[]
    PROTOBUF_SECTION_VARIABLE(protodesc_cold);
  static const ::PROTOBUF_NAMESPACE_ID::internal::AuxiliaryParseTableField aux[]
    PROTOBUF_SECTION_VARIABLE(protodesc_cold);
  static const ::PROTOBUF_NAMESPACE_ID::internal::ParseTable schema[2]
    PROTOBUF_SECTION_VARIABLE(protodesc_cold);
  static const ::PROTOBUF_NAMESPACE_ID::internal::FieldMetadata field_metadata[];
  static const ::PROTOBUF_NAMESPACE_ID::internal::SerializationTable serialization_table[];
  static const ::PROTOBUF_NAMESPACE_ID::uint32 offsets[];
};
extern const ::PROTOBUF_NAMESPACE_ID::internal::DescriptorTable descriptor_table_deephaven_2fproto_2fticket_2eproto;
namespace io {
namespace deephaven {
namespace proto {
namespace backplane {
namespace grpc {
class Ticket;
struct TicketDefaultTypeInternal;
extern TicketDefaultTypeInternal _Ticket_default_instance_;
class TypedTicket;
struct TypedTicketDefaultTypeInternal;
extern TypedTicketDefaultTypeInternal _TypedTicket_default_instance_;
}  // namespace grpc
}  // namespace backplane
}  // namespace proto
}  // namespace deephaven
}  // namespace io
PROTOBUF_NAMESPACE_OPEN
template<> ::io::deephaven::proto::backplane::grpc::Ticket* Arena::CreateMaybeMessage<::io::deephaven::proto::backplane::grpc::Ticket>(Arena*);
template<> ::io::deephaven::proto::backplane::grpc::TypedTicket* Arena::CreateMaybeMessage<::io::deephaven::proto::backplane::grpc::TypedTicket>(Arena*);
PROTOBUF_NAMESPACE_CLOSE
namespace io {
namespace deephaven {
namespace proto {
namespace backplane {
namespace grpc {

// ===================================================================

class Ticket final :
    public ::PROTOBUF_NAMESPACE_ID::Message /* @@protoc_insertion_point(class_definition:io.deephaven.proto.backplane.grpc.Ticket) */ {
 public:
  inline Ticket() : Ticket(nullptr) {}
  ~Ticket() override;
  explicit constexpr Ticket(::PROTOBUF_NAMESPACE_ID::internal::ConstantInitialized);

  Ticket(const Ticket& from);
  Ticket(Ticket&& from) noexcept
    : Ticket() {
    *this = ::std::move(from);
  }

  inline Ticket& operator=(const Ticket& from) {
    CopyFrom(from);
    return *this;
  }
  inline Ticket& operator=(Ticket&& from) noexcept {
    if (this == &from) return *this;
    if (GetOwningArena() == from.GetOwningArena()
  #ifdef PROTOBUF_FORCE_COPY_IN_MOVE
        && GetOwningArena() != nullptr
  #endif  // !PROTOBUF_FORCE_COPY_IN_MOVE
    ) {
      InternalSwap(&from);
    } else {
      CopyFrom(from);
    }
    return *this;
  }

  static const ::PROTOBUF_NAMESPACE_ID::Descriptor* descriptor() {
    return GetDescriptor();
  }
  static const ::PROTOBUF_NAMESPACE_ID::Descriptor* GetDescriptor() {
    return default_instance().GetMetadata().descriptor;
  }
  static const ::PROTOBUF_NAMESPACE_ID::Reflection* GetReflection() {
    return default_instance().GetMetadata().reflection;
  }
  static const Ticket& default_instance() {
    return *internal_default_instance();
  }
  static inline const Ticket* internal_default_instance() {
    return reinterpret_cast<const Ticket*>(
               &_Ticket_default_instance_);
  }
  static constexpr int kIndexInFileMessages =
    0;

  friend void swap(Ticket& a, Ticket& b) {
    a.Swap(&b);
  }
  inline void Swap(Ticket* other) {
    if (other == this) return;
    if (GetOwningArena() == other->GetOwningArena()) {
      InternalSwap(other);
    } else {
      ::PROTOBUF_NAMESPACE_ID::internal::GenericSwap(this, other);
    }
  }
  void UnsafeArenaSwap(Ticket* other) {
    if (other == this) return;
    GOOGLE_DCHECK(GetOwningArena() == other->GetOwningArena());
    InternalSwap(other);
  }

  // implements Message ----------------------------------------------

  inline Ticket* New() const final {
    return new Ticket();
  }

  Ticket* New(::PROTOBUF_NAMESPACE_ID::Arena* arena) const final {
    return CreateMaybeMessage<Ticket>(arena);
  }
  using ::PROTOBUF_NAMESPACE_ID::Message::CopyFrom;
  void CopyFrom(const Ticket& from);
  using ::PROTOBUF_NAMESPACE_ID::Message::MergeFrom;
  void MergeFrom(const Ticket& from);
  private:
  static void MergeImpl(::PROTOBUF_NAMESPACE_ID::Message* to, const ::PROTOBUF_NAMESPACE_ID::Message& from);
  public:
  PROTOBUF_ATTRIBUTE_REINITIALIZES void Clear() final;
  bool IsInitialized() const final;

  size_t ByteSizeLong() const final;
  const char* _InternalParse(const char* ptr, ::PROTOBUF_NAMESPACE_ID::internal::ParseContext* ctx) final;
  ::PROTOBUF_NAMESPACE_ID::uint8* _InternalSerialize(
      ::PROTOBUF_NAMESPACE_ID::uint8* target, ::PROTOBUF_NAMESPACE_ID::io::EpsCopyOutputStream* stream) const final;
  int GetCachedSize() const final { return _cached_size_.Get(); }

  private:
  void SharedCtor();
  void SharedDtor();
  void SetCachedSize(int size) const final;
  void InternalSwap(Ticket* other);
  friend class ::PROTOBUF_NAMESPACE_ID::internal::AnyMetadata;
  static ::PROTOBUF_NAMESPACE_ID::StringPiece FullMessageName() {
    return "io.deephaven.proto.backplane.grpc.Ticket";
  }
  protected:
  explicit Ticket(::PROTOBUF_NAMESPACE_ID::Arena* arena,
                       bool is_message_owned = false);
  private:
  static void ArenaDtor(void* object);
  inline void RegisterArenaDtor(::PROTOBUF_NAMESPACE_ID::Arena* arena);
  public:

  static const ClassData _class_data_;
  const ::PROTOBUF_NAMESPACE_ID::Message::ClassData*GetClassData() const final;

  ::PROTOBUF_NAMESPACE_ID::Metadata GetMetadata() const final;

  // nested types ----------------------------------------------------

  // accessors -------------------------------------------------------

  enum : int {
    kTicketFieldNumber = 1,
  };
  // bytes ticket = 1;
  void clear_ticket();
  const std::string& ticket() const;
  template <typename ArgT0 = const std::string&, typename... ArgT>
  void set_ticket(ArgT0&& arg0, ArgT... args);
  std::string* mutable_ticket();
  PROTOBUF_MUST_USE_RESULT std::string* release_ticket();
  void set_allocated_ticket(std::string* ticket);
  private:
  const std::string& _internal_ticket() const;
  inline PROTOBUF_ALWAYS_INLINE void _internal_set_ticket(const std::string& value);
  std::string* _internal_mutable_ticket();
  public:

  // @@protoc_insertion_point(class_scope:io.deephaven.proto.backplane.grpc.Ticket)
 private:
  class _Internal;

  template <typename T> friend class ::PROTOBUF_NAMESPACE_ID::Arena::InternalHelper;
  typedef void InternalArenaConstructable_;
  typedef void DestructorSkippable_;
  ::PROTOBUF_NAMESPACE_ID::internal::ArenaStringPtr ticket_;
  mutable ::PROTOBUF_NAMESPACE_ID::internal::CachedSize _cached_size_;
  friend struct ::TableStruct_deephaven_2fproto_2fticket_2eproto;
};
// -------------------------------------------------------------------

class TypedTicket final :
    public ::PROTOBUF_NAMESPACE_ID::Message /* @@protoc_insertion_point(class_definition:io.deephaven.proto.backplane.grpc.TypedTicket) */ {
 public:
  inline TypedTicket() : TypedTicket(nullptr) {}
  ~TypedTicket() override;
  explicit constexpr TypedTicket(::PROTOBUF_NAMESPACE_ID::internal::ConstantInitialized);

  TypedTicket(const TypedTicket& from);
  TypedTicket(TypedTicket&& from) noexcept
    : TypedTicket() {
    *this = ::std::move(from);
  }

  inline TypedTicket& operator=(const TypedTicket& from) {
    CopyFrom(from);
    return *this;
  }
  inline TypedTicket& operator=(TypedTicket&& from) noexcept {
    if (this == &from) return *this;
    if (GetOwningArena() == from.GetOwningArena()
  #ifdef PROTOBUF_FORCE_COPY_IN_MOVE
        && GetOwningArena() != nullptr
  #endif  // !PROTOBUF_FORCE_COPY_IN_MOVE
    ) {
      InternalSwap(&from);
    } else {
      CopyFrom(from);
    }
    return *this;
  }

  static const ::PROTOBUF_NAMESPACE_ID::Descriptor* descriptor() {
    return GetDescriptor();
  }
  static const ::PROTOBUF_NAMESPACE_ID::Descriptor* GetDescriptor() {
    return default_instance().GetMetadata().descriptor;
  }
  static const ::PROTOBUF_NAMESPACE_ID::Reflection* GetReflection() {
    return default_instance().GetMetadata().reflection;
  }
  static const TypedTicket& default_instance() {
    return *internal_default_instance();
  }
  static inline const TypedTicket* internal_default_instance() {
    return reinterpret_cast<const TypedTicket*>(
               &_TypedTicket_default_instance_);
  }
  static constexpr int kIndexInFileMessages =
    1;

  friend void swap(TypedTicket& a, TypedTicket& b) {
    a.Swap(&b);
  }
  inline void Swap(TypedTicket* other) {
    if (other == this) return;
    if (GetOwningArena() == other->GetOwningArena()) {
      InternalSwap(other);
    } else {
      ::PROTOBUF_NAMESPACE_ID::internal::GenericSwap(this, other);
    }
  }
  void UnsafeArenaSwap(TypedTicket* other) {
    if (other == this) return;
    GOOGLE_DCHECK(GetOwningArena() == other->GetOwningArena());
    InternalSwap(other);
  }

  // implements Message ----------------------------------------------

  inline TypedTicket* New() const final {
    return new TypedTicket();
  }

  TypedTicket* New(::PROTOBUF_NAMESPACE_ID::Arena* arena) const final {
    return CreateMaybeMessage<TypedTicket>(arena);
  }
  using ::PROTOBUF_NAMESPACE_ID::Message::CopyFrom;
  void CopyFrom(const TypedTicket& from);
  using ::PROTOBUF_NAMESPACE_ID::Message::MergeFrom;
  void MergeFrom(const TypedTicket& from);
  private:
  static void MergeImpl(::PROTOBUF_NAMESPACE_ID::Message* to, const ::PROTOBUF_NAMESPACE_ID::Message& from);
  public:
  PROTOBUF_ATTRIBUTE_REINITIALIZES void Clear() final;
  bool IsInitialized() const final;

  size_t ByteSizeLong() const final;
  const char* _InternalParse(const char* ptr, ::PROTOBUF_NAMESPACE_ID::internal::ParseContext* ctx) final;
  ::PROTOBUF_NAMESPACE_ID::uint8* _InternalSerialize(
      ::PROTOBUF_NAMESPACE_ID::uint8* target, ::PROTOBUF_NAMESPACE_ID::io::EpsCopyOutputStream* stream) const final;
  int GetCachedSize() const final { return _cached_size_.Get(); }

  private:
  void SharedCtor();
  void SharedDtor();
  void SetCachedSize(int size) const final;
  void InternalSwap(TypedTicket* other);
  friend class ::PROTOBUF_NAMESPACE_ID::internal::AnyMetadata;
  static ::PROTOBUF_NAMESPACE_ID::StringPiece FullMessageName() {
    return "io.deephaven.proto.backplane.grpc.TypedTicket";
  }
  protected:
  explicit TypedTicket(::PROTOBUF_NAMESPACE_ID::Arena* arena,
                       bool is_message_owned = false);
  private:
  static void ArenaDtor(void* object);
  inline void RegisterArenaDtor(::PROTOBUF_NAMESPACE_ID::Arena* arena);
  public:

  static const ClassData _class_data_;
  const ::PROTOBUF_NAMESPACE_ID::Message::ClassData*GetClassData() const final;

  ::PROTOBUF_NAMESPACE_ID::Metadata GetMetadata() const final;

  // nested types ----------------------------------------------------

  // accessors -------------------------------------------------------

  enum : int {
    kTypeFieldNumber = 2,
    kTicketFieldNumber = 1,
  };
  // string type = 2;
  void clear_type();
  const std::string& type() const;
  template <typename ArgT0 = const std::string&, typename... ArgT>
  void set_type(ArgT0&& arg0, ArgT... args);
  std::string* mutable_type();
  PROTOBUF_MUST_USE_RESULT std::string* release_type();
  void set_allocated_type(std::string* type);
  private:
  const std::string& _internal_type() const;
  inline PROTOBUF_ALWAYS_INLINE void _internal_set_type(const std::string& value);
  std::string* _internal_mutable_type();
  public:

  // .io.deephaven.proto.backplane.grpc.Ticket ticket = 1;
  bool has_ticket() const;
  private:
  bool _internal_has_ticket() const;
  public:
  void clear_ticket();
  const ::io::deephaven::proto::backplane::grpc::Ticket& ticket() const;
  PROTOBUF_MUST_USE_RESULT ::io::deephaven::proto::backplane::grpc::Ticket* release_ticket();
  ::io::deephaven::proto::backplane::grpc::Ticket* mutable_ticket();
  void set_allocated_ticket(::io::deephaven::proto::backplane::grpc::Ticket* ticket);
  private:
  const ::io::deephaven::proto::backplane::grpc::Ticket& _internal_ticket() const;
  ::io::deephaven::proto::backplane::grpc::Ticket* _internal_mutable_ticket();
  public:
  void unsafe_arena_set_allocated_ticket(
      ::io::deephaven::proto::backplane::grpc::Ticket* ticket);
  ::io::deephaven::proto::backplane::grpc::Ticket* unsafe_arena_release_ticket();

  // @@protoc_insertion_point(class_scope:io.deephaven.proto.backplane.grpc.TypedTicket)
 private:
  class _Internal;

  template <typename T> friend class ::PROTOBUF_NAMESPACE_ID::Arena::InternalHelper;
  typedef void InternalArenaConstructable_;
  typedef void DestructorSkippable_;
  ::PROTOBUF_NAMESPACE_ID::internal::ArenaStringPtr type_;
  ::io::deephaven::proto::backplane::grpc::Ticket* ticket_;
  mutable ::PROTOBUF_NAMESPACE_ID::internal::CachedSize _cached_size_;
  friend struct ::TableStruct_deephaven_2fproto_2fticket_2eproto;
};
// ===================================================================


// ===================================================================

#ifdef __GNUC__
  #pragma GCC diagnostic push
  #pragma GCC diagnostic ignored "-Wstrict-aliasing"
#endif  // __GNUC__
// Ticket

// bytes ticket = 1;
inline void Ticket::clear_ticket() {
  ticket_.ClearToEmpty();
}
inline const std::string& Ticket::ticket() const {
  // @@protoc_insertion_point(field_get:io.deephaven.proto.backplane.grpc.Ticket.ticket)
  return _internal_ticket();
}
template <typename ArgT0, typename... ArgT>
inline PROTOBUF_ALWAYS_INLINE
void Ticket::set_ticket(ArgT0&& arg0, ArgT... args) {
 
 ticket_.SetBytes(::PROTOBUF_NAMESPACE_ID::internal::ArenaStringPtr::EmptyDefault{}, static_cast<ArgT0 &&>(arg0), args..., GetArenaForAllocation());
  // @@protoc_insertion_point(field_set:io.deephaven.proto.backplane.grpc.Ticket.ticket)
}
inline std::string* Ticket::mutable_ticket() {
  std::string* _s = _internal_mutable_ticket();
  // @@protoc_insertion_point(field_mutable:io.deephaven.proto.backplane.grpc.Ticket.ticket)
  return _s;
}
inline const std::string& Ticket::_internal_ticket() const {
  return ticket_.Get();
}
inline void Ticket::_internal_set_ticket(const std::string& value) {
  
  ticket_.Set(::PROTOBUF_NAMESPACE_ID::internal::ArenaStringPtr::EmptyDefault{}, value, GetArenaForAllocation());
}
inline std::string* Ticket::_internal_mutable_ticket() {
  
  return ticket_.Mutable(::PROTOBUF_NAMESPACE_ID::internal::ArenaStringPtr::EmptyDefault{}, GetArenaForAllocation());
}
inline std::string* Ticket::release_ticket() {
  // @@protoc_insertion_point(field_release:io.deephaven.proto.backplane.grpc.Ticket.ticket)
  return ticket_.Release(&::PROTOBUF_NAMESPACE_ID::internal::GetEmptyStringAlreadyInited(), GetArenaForAllocation());
}
inline void Ticket::set_allocated_ticket(std::string* ticket) {
  if (ticket != nullptr) {
    
  } else {
    
  }
  ticket_.SetAllocated(&::PROTOBUF_NAMESPACE_ID::internal::GetEmptyStringAlreadyInited(), ticket,
      GetArenaForAllocation());
  // @@protoc_insertion_point(field_set_allocated:io.deephaven.proto.backplane.grpc.Ticket.ticket)
}

// -------------------------------------------------------------------

// TypedTicket

// .io.deephaven.proto.backplane.grpc.Ticket ticket = 1;
inline bool TypedTicket::_internal_has_ticket() const {
  return this != internal_default_instance() && ticket_ != nullptr;
}
inline bool TypedTicket::has_ticket() const {
  return _internal_has_ticket();
}
inline void TypedTicket::clear_ticket() {
  if (GetArenaForAllocation() == nullptr && ticket_ != nullptr) {
    delete ticket_;
  }
  ticket_ = nullptr;
}
inline const ::io::deephaven::proto::backplane::grpc::Ticket& TypedTicket::_internal_ticket() const {
  const ::io::deephaven::proto::backplane::grpc::Ticket* p = ticket_;
  return p != nullptr ? *p : reinterpret_cast<const ::io::deephaven::proto::backplane::grpc::Ticket&>(
      ::io::deephaven::proto::backplane::grpc::_Ticket_default_instance_);
}
inline const ::io::deephaven::proto::backplane::grpc::Ticket& TypedTicket::ticket() const {
  // @@protoc_insertion_point(field_get:io.deephaven.proto.backplane.grpc.TypedTicket.ticket)
  return _internal_ticket();
}
inline void TypedTicket::unsafe_arena_set_allocated_ticket(
    ::io::deephaven::proto::backplane::grpc::Ticket* ticket) {
  if (GetArenaForAllocation() == nullptr) {
    delete reinterpret_cast<::PROTOBUF_NAMESPACE_ID::MessageLite*>(ticket_);
  }
  ticket_ = ticket;
  if (ticket) {
    
  } else {
    
  }
  // @@protoc_insertion_point(field_unsafe_arena_set_allocated:io.deephaven.proto.backplane.grpc.TypedTicket.ticket)
}
inline ::io::deephaven::proto::backplane::grpc::Ticket* TypedTicket::release_ticket() {
  
  ::io::deephaven::proto::backplane::grpc::Ticket* temp = ticket_;
  ticket_ = nullptr;
#ifdef PROTOBUF_FORCE_COPY_IN_RELEASE
  auto* old =  reinterpret_cast<::PROTOBUF_NAMESPACE_ID::MessageLite*>(temp);
  temp = ::PROTOBUF_NAMESPACE_ID::internal::DuplicateIfNonNull(temp);
  if (GetArenaForAllocation() == nullptr) { delete old; }
#else  // PROTOBUF_FORCE_COPY_IN_RELEASE
  if (GetArenaForAllocation() != nullptr) {
    temp = ::PROTOBUF_NAMESPACE_ID::internal::DuplicateIfNonNull(temp);
  }
#endif  // !PROTOBUF_FORCE_COPY_IN_RELEASE
  return temp;
}
inline ::io::deephaven::proto::backplane::grpc::Ticket* TypedTicket::unsafe_arena_release_ticket() {
  // @@protoc_insertion_point(field_release:io.deephaven.proto.backplane.grpc.TypedTicket.ticket)
  
  ::io::deephaven::proto::backplane::grpc::Ticket* temp = ticket_;
  ticket_ = nullptr;
  return temp;
}
inline ::io::deephaven::proto::backplane::grpc::Ticket* TypedTicket::_internal_mutable_ticket() {
  
  if (ticket_ == nullptr) {
    auto* p = CreateMaybeMessage<::io::deephaven::proto::backplane::grpc::Ticket>(GetArenaForAllocation());
    ticket_ = p;
  }
  return ticket_;
}
inline ::io::deephaven::proto::backplane::grpc::Ticket* TypedTicket::mutable_ticket() {
  ::io::deephaven::proto::backplane::grpc::Ticket* _msg = _internal_mutable_ticket();
  // @@protoc_insertion_point(field_mutable:io.deephaven.proto.backplane.grpc.TypedTicket.ticket)
  return _msg;
}
inline void TypedTicket::set_allocated_ticket(::io::deephaven::proto::backplane::grpc::Ticket* ticket) {
  ::PROTOBUF_NAMESPACE_ID::Arena* message_arena = GetArenaForAllocation();
  if (message_arena == nullptr) {
    delete ticket_;
  }
  if (ticket) {
    ::PROTOBUF_NAMESPACE_ID::Arena* submessage_arena =
        ::PROTOBUF_NAMESPACE_ID::Arena::InternalHelper<::io::deephaven::proto::backplane::grpc::Ticket>::GetOwningArena(ticket);
    if (message_arena != submessage_arena) {
      ticket = ::PROTOBUF_NAMESPACE_ID::internal::GetOwnedMessage(
          message_arena, ticket, submessage_arena);
    }
    
  } else {
    
  }
  ticket_ = ticket;
  // @@protoc_insertion_point(field_set_allocated:io.deephaven.proto.backplane.grpc.TypedTicket.ticket)
}

// string type = 2;
inline void TypedTicket::clear_type() {
  type_.ClearToEmpty();
}
inline const std::string& TypedTicket::type() const {
  // @@protoc_insertion_point(field_get:io.deephaven.proto.backplane.grpc.TypedTicket.type)
  return _internal_type();
}
template <typename ArgT0, typename... ArgT>
inline PROTOBUF_ALWAYS_INLINE
void TypedTicket::set_type(ArgT0&& arg0, ArgT... args) {
 
 type_.Set(::PROTOBUF_NAMESPACE_ID::internal::ArenaStringPtr::EmptyDefault{}, static_cast<ArgT0 &&>(arg0), args..., GetArenaForAllocation());
  // @@protoc_insertion_point(field_set:io.deephaven.proto.backplane.grpc.TypedTicket.type)
}
inline std::string* TypedTicket::mutable_type() {
  std::string* _s = _internal_mutable_type();
  // @@protoc_insertion_point(field_mutable:io.deephaven.proto.backplane.grpc.TypedTicket.type)
  return _s;
}
inline const std::string& TypedTicket::_internal_type() const {
  return type_.Get();
}
inline void TypedTicket::_internal_set_type(const std::string& value) {
  
  type_.Set(::PROTOBUF_NAMESPACE_ID::internal::ArenaStringPtr::EmptyDefault{}, value, GetArenaForAllocation());
}
inline std::string* TypedTicket::_internal_mutable_type() {
  
  return type_.Mutable(::PROTOBUF_NAMESPACE_ID::internal::ArenaStringPtr::EmptyDefault{}, GetArenaForAllocation());
}
inline std::string* TypedTicket::release_type() {
  // @@protoc_insertion_point(field_release:io.deephaven.proto.backplane.grpc.TypedTicket.type)
  return type_.Release(&::PROTOBUF_NAMESPACE_ID::internal::GetEmptyStringAlreadyInited(), GetArenaForAllocation());
}
inline void TypedTicket::set_allocated_type(std::string* type) {
  if (type != nullptr) {
    
  } else {
    
  }
  type_.SetAllocated(&::PROTOBUF_NAMESPACE_ID::internal::GetEmptyStringAlreadyInited(), type,
      GetArenaForAllocation());
  // @@protoc_insertion_point(field_set_allocated:io.deephaven.proto.backplane.grpc.TypedTicket.type)
}

#ifdef __GNUC__
  #pragma GCC diagnostic pop
#endif  // __GNUC__
// -------------------------------------------------------------------


// @@protoc_insertion_point(namespace_scope)

}  // namespace grpc
}  // namespace backplane
}  // namespace proto
}  // namespace deephaven
}  // namespace io

// @@protoc_insertion_point(global_scope)

#include <google/protobuf/port_undef.inc>
#endif  // GOOGLE_PROTOBUF_INCLUDED_GOOGLE_PROTOBUF_INCLUDED_deephaven_2fproto_2fticket_2eproto
