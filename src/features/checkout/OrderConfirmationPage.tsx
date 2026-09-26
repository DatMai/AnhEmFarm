export function OrderConfirmationPage({
  cartPreserved
}: {
  cartPreserved: boolean
}) {
  return (
    <>
      <h1>Order confirmed</h1>
      <p>Your order was recorded with cash on delivery.</p>
      {cartPreserved && (
        <p>
          Your cart changed during checkout and was preserved. Review it before
          ordering again.
        </p>
      )}
    </>
  )
}
