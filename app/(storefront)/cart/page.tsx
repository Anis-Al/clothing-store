import { CartView } from "@/components/store/cart-view"
import { getI18n, getSettings } from "@/lib/i18n"

export async function generateMetadata() {
  return { title: (await getI18n()).t.cart.title }
}

export default async function CartPage() {
  return <CartView fee={(await getSettings()).deliveryFee} />
}
