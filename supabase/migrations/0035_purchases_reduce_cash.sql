-- 0035_purchases_reduce_cash.sql — buying is not a cost, but it is money gone.
--
-- Cash on hand was advances minus expenses. Stock purchases were invisible to
-- it, so buying ₱275,000 of fertiliser out of the float left the app saying
-- the float still held ₱275,000. Buying is not a cost — that is the whole
-- point of the stock ledger, and it does not change — but it is certainly a
-- reduction in cash.
--
-- Not every purchase comes out of the farm manager's float: some the owners
-- pay for directly, and those must not be deducted from money he is holding.
-- Hence the flag rather than counting every purchase.

alter table input_purchases
  add column if not exists paid_from_float boolean not null default true;

comment on column input_purchases.paid_from_float is
  'True when the farm manager paid out of his cash advance, so it reduces '
  'cash on hand. False when an owner paid the supplier directly, which is '
  'still stock but never touched his float.';

-- Existing rows are set to false on purpose.
--
-- Nobody recorded who paid for the purchases already on file, and the honest
-- answer is that we do not know. Defaulting them to true would restate the
-- cash position by the entire purchase history in one deploy, which is a
-- large number appearing from nowhere on the screen Anthony trusts most.
-- Leaving them false keeps today's figure exactly as it is and lets the
-- owners correct individual lots if they remember. New purchases ask.
update input_purchases set paid_from_float = false;
