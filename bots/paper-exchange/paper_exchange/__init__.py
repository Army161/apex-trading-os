"""Paper exchange (archive/chat/77, 79, 80): an in-memory order book replayed from recorder files, a timestamped event stream,
a pre-trade risk gate every paper order must pass, an order-state log and latency metrics. Paper only: there is no network
code here and no way to reach an exchange. Apex can't compete on speed with colocated firms, so speed-based edges are marked
not viable for us; this exists to test logic honestly, not to be fast."""
from .book import OrderBook
from .events import Event, EventStream
from .risk import RiskLimits, RiskGate
from .orders import PaperOrder, OrderLog
from .metrics import Latency
