import hashlib, json , os
from web3 import Web3

# secrets
BLOCKCHAIN_RPC = os.environ.get('BLOCKCHAIN_RPC', '')
BLOCKCHAIN_PRIVATE_KEY = os.environ.get('BLOCKCHAIN_PRIVATE_KEY', '')
BLOCKCHAIN_CONTRACT_ADDRESS = os.environ.get('BLOCKCHAIN_CONTRACT_ADDRESS', '')


CONTRACT_ABI = [
    {
        "inputs": [{"name": "dataHash", "type": "bytes32"}],
        "name": "storeHash",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{"name": "dataHash", "type": "bytes32"}],
        "name": "verifyHash",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{"name": "dataHash", "type": "bytes32"}],
        "name": "getTimestamp",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    }
]


def _get_web3():
    if not BLOCKCHAIN_RPC:
        return None
    return Web3(Web3.HTTPProvider(BLOCKCHAIN_RPC))


def _get_contract(w3):

    if not BLOCKCHAIN_CONTRACT_ADDRESS:
        return None
    return w3.eth.contract(
        address=Web3.to_checksum_address(BLOCKCHAIN_CONTRACT_ADDRESS),
        abi=CONTRACT_ABI
    )


def generate_hash(data) -> str:
    if isinstance(data, dict):
        data = json.dumps(data, sort_keys=True)
    if isinstance(data, str):
        data = data.encode('utf-8')
    return hashlib.sha256(data).hexdigest()


def store_hash_on_chain(data_hash: str) -> str:
    w3 = _get_web3()
    if not w3 or not BLOCKCHAIN_PRIVATE_KEY:
        print("blockhain not configured")
        return ""
    try:
        contract = _get_contract(w3)
        if not contract:
            return ""

        account = w3.eth.account.from_key(BLOCKCHAIN_PRIVATE_KEY)
        hash_bytes = bytes.fromhex(data_hash)

        tx = contract.functions.storeHash(hash_bytes).build_transaction({
            'from': account.address,
            'nonce': w3.eth.get_transaction_count(account.address),
            'gas': 100000,
            'gasPrice': w3.eth.gas_price
        })

        signed = w3.eth.account.sign_transaction(tx, BLOCKCHAIN_PRIVATE_KEY)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
        tx_hex = receipt.transactionHash.hex()
        print(f"bc Hash stored {data_hash[:16]}... tx: {tx_hex}")
        return tx_hex
    except Exception as e:
        print(f"bc err {e}")
        return ""


def verify_hash_on_chain(data_hash: str) -> bool:
    w3 = _get_web3()
    if not w3:
        return True  # skips verification if not configured

    try:
        contract = _get_contract(w3)
        if not contract:
            return True

        hash_bytes = bytes.fromhex(data_hash)
        return contract.functions.verifyHash(hash_bytes).call()
    except Exception as e:
        print(f"bc err verifying HaSh {e}")
        return True


def verify_integrity(stored_hash: str, current_data) -> dict:
    current_hash = generate_hash(current_data)
    db_match = current_hash == stored_hash
    chain_verified = verify_hash_on_chain(stored_hash) if stored_hash else True

    return {
        "stored_hash": stored_hash,
        "current_hash": current_hash,
        "db_match": db_match,
        "chain_verified": chain_verified,
        "tampered": not db_match
    }
