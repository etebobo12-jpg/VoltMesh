;; VoltMesh Settlement and Escrow Contract
;; Clarity v2
;; Manages escrow for energy trades, verifies delivery via oracle, and handles disputes

(define-constant ERR-NOT-AUTHORIZED u200)
(define-constant ERR-INSUFFICIENT-FUNDS u201)
(define-constant ERR-TRADE-NOT-FOUND u202)
(define-constant ERR-TRADE-EXPIRED u203)
(define-constant ERR-ALREADY-SETTLED u204)
(define-constant ERR-INVALID-AMOUNT u205)
(define-constant ERR-ORACLE-FAILURE u206)
(define-constant ERR-DISPUTE-RESOLVED u207)
(define-constant ERR-INVALID-STATE u208)
(define-constant ERR-ZERO-ADDRESS u209)

;; Constants
(define-constant ORACLE-PRINCIPAL 'SP000000000000000000002Q6VF78) ;; Placeholder for oracle contract
(define-constant TRADE-TIMEOUT u144) ;; ~24 hours in blocks (10 min/block)
(define-constant MIN-TRADE-AMOUNT u1000) ;; Minimum trade amount (in micro-units)

;; Data variables
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var oracle-enabled bool true)

;; Trade state enum
(define-constant TRADE-STATE-PENDING u0)
(define-constant TRADE-STATE-DELIVERED u1)
(define-constant TRADE-STATE-SETTLED u2)
(define-constant TRADE-STATE-DISPUTED u3)
(define-constant TRADE-STATE-CANCELLED u4)

;; Escrow trade data
(define-map trades
  { trade-id: uint }
  {
    seller: principal,
    buyer: principal,
    amount: uint, ;; Energy tokens
    price: uint, ;; STX price (in micro-STX)
    escrow-funds: uint,
    state: uint,
    created-at: uint,
    last-updated: uint,
    dispute-reason: (optional (string-ascii 256))
  }
)

;; Dispute resolution votes
(define-map dispute-votes
  { trade-id: uint, voter: principal }
  { vote: bool } ;; true = favor buyer, false = favor seller
)

;; Private helper: is-admin
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; Private helper: ensure not paused
(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
)

;; Private helper: is-oracle
(define-private (is-oracle)
  (is-eq tx-sender ORACLE-PRINCIPAL)
)

;; Private helper: check trade exists
(define-private (trade-exists (trade-id uint))
  (is-some (map-get? trades { trade-id: trade-id }))
)

;; Transfer admin rights
(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-admin 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (var-set admin new-admin)
    (ok true)
  )
)

;; Pause/unpause the contract
(define-public (set-paused (pause bool))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set paused pause)
    (ok pause)
  )
)

;; Toggle oracle usage
(define-public (set-oracle-enabled (enabled bool))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set oracle-enabled enabled)
    (ok enabled)
  )
)

;; Create a new trade escrow
(define-public (create-trade (trade-id uint) (seller principal) (amount uint) (price uint))
  (let
    (
      (buyer tx-sender)
      (escrow-amount price)
    )
    (ensure-not-paused)
    (asserts! (not (is-eq seller 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (asserts! (not (trade-exists trade-id)) (err ERR-TRADE-NOT-FOUND))
    (asserts! (>= amount MIN-TRADE-AMOUNT) (err ERR-INVALID-AMOUNT))
    (try! (stx-transfer? escrow-amount tx-sender (as-contract tx-sender)))
    (map-set trades
      { trade-id: trade-id }
      {
        seller: seller,
        buyer: buyer,
        amount: amount,
        price: escrow-amount,
        escrow-funds: escrow-amount,
        state: TRADE-STATE-PENDING,
        created-at: block-height,
        last-updated: block-height,
        dispute-reason: none
      }
    )
    (ok true)
  )
)

;; Oracle confirms energy delivery
(define-public (confirm-delivery (trade-id uint))
  (let
    (
      (trade (unwrap! (map-get? trades { trade-id: trade-id }) (err ERR-TRADE-NOT-FOUND)))
      (current-state (get state trade))
    )
    (asserts! (var-get oracle-enabled) (err ERR-ORACLE-FAILURE))
    (asserts! (is-oracle) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq current-state TRADE-STATE-PENDING) (err ERR-INVALID-STATE))
    (map-set trades
      { trade-id: trade-id }
      (merge trade { state: TRADE-STATE-DELIVERED, last-updated: block-height })
    )
    (ok true)
  )
)

;; Settle trade (release funds to seller)
(define-public (settle-trade (trade-id uint))
  (let
    (
      (trade (unwrap! (map-get? trades { trade-id: trade-id }) (err ERR-TRADE-NOT-FOUND)))
      (current-state (get state trade))
      (escrow-amount (get escrow-funds trade))
      (seller (get seller trade))
    )
    (ensure-not-paused)
    (asserts! (is-eq tx-sender (get buyer trade)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq current-state TRADE-STATE-DELIVERED) (err ERR-INVALID-STATE))
    (asserts! (> escrow-amount u0) (err ERR-INSUFFICIENT-FUNDS))
    (map-set trades
      { trade-id: trade-id }
      (merge trade { state: TRADE-STATE-SETTLED, last-updated: block-height })
    )
    (try! (as-contract (stx-transfer? escrow-amount tx-sender seller)))
    (ok true)
  )
)

;; Cancel trade (refund buyer if timed out or not delivered)
(define-public (cancel-trade (trade-id uint))
  (let
    (
      (trade (unwrap! (map-get? trades { trade-id: trade-id }) (err ERR-TRADE-NOT-FOUND)))
      (current-state (get state trade))
      (escrow-amount (get escrow-funds trade))
      (buyer (get buyer trade))
      (created-at (get created-at trade))
    )
    (ensure-not-paused)
    (asserts! (or (is-eq tx-sender buyer) (is-admin)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq current-state TRADE-STATE-PENDING) (err ERR-INVALID-STATE))
    (asserts! (>= (- block-height created-at) TRADE-TIMEOUT) (err ERR-TRADE-EXPIRED))
    (map-set trades
      { trade-id: trade-id }
      (merge trade { state: TRADE-STATE-CANCELLED, last-updated: block-height })
    )
    (try! (as-contract (stx-transfer? escrow-amount tx-sender buyer)))
    (ok true)
  )
)

;; Initiate dispute
(define-public (initiate-dispute (trade-id uint) (reason (string-ascii 256)))
  (let
    (
      (trade (unwrap! (map-get? trades { trade-id: trade-id }) (err ERR-TRADE-NOT-FOUND)))
      (current-state (get state trade))
    )
    (ensure-not-paused)
    (asserts! (is-eq tx-sender (get buyer trade)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq current-state TRADE-STATE-PENDING) (err ERR-INVALID-STATE))
    (map-set trades
      { trade-id: trade-id }
      (merge trade { state: TRADE-STATE-DISPUTED, dispute-reason: (some reason), last-updated: block-height })
    )
    (ok true)
  )
)

;; Resolve dispute (admin action)
(define-public (resolve-dispute (trade-id uint) (favor-buyer bool))
  (let
    (
      (trade (unwrap! (map-get? trades { trade-id: trade-id }) (err ERR-TRADE-NOT-FOUND)))
      (current-state (get state trade))
      (escrow-amount (get escrow-funds trade))
      (recipient (if favor-buyer (get buyer trade) (get seller trade)))
    )
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq current-state TRADE-STATE-DISPUTED) (err ERR-INVALID-STATE))
    (map-set trades
      { trade-id: trade-id }
      (merge trade { state: TRADE-STATE-SETTLED, last-updated: block-height })
    )
    (try! (as-contract (stx-transfer? escrow-amount tx-sender recipient)))
    (ok true)
  )
)

;; Read-only: get trade details
(define-read-only (get-trade (trade-id uint))
  (ok (default-to
        { seller: 'SP000000000000000000002Q6VF78, buyer: 'SP000000000000000000002Q6VF78, amount: u0, price: u0, escrow-funds: u0, state: u0, created-at: u0, last-updated: u0, dispute-reason: none }
        (map-get? trades { trade-id: trade-id })))
)

;; Read-only: get admin
(define-read-only (get-admin)
  (ok (var-get admin))
)

;; Read-only: is paused
(define-read-only (is-paused)
  (ok (var-get paused))
)

;; Read-only: is oracle enabled
(define-read-only (is-oracle-enabled)
  (ok (var-get oracle-enabled))
)