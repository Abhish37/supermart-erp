"""
EAN-13 Barcode Generator and Checksum Validator
Compliant with GS1 Modulo-10 Standard for Retail & Private Label Products
"""

def calculate_ean13_checksum(digits12: str) -> int:
    """
    Computes the 13th check digit for a 12-digit string according to GS1 standard.
    Odd-index digits (0, 2, 4...) weighted by 1.
    Even-index digits (1, 3, 5...) weighted by 3.
    """
    if len(digits12) != 12 or not digits12.isdigit():
        raise ValueError(f"Input must be exactly 12 numeric digits, got: {digits12}")
    
    odd_sum = sum(int(digits12[i]) for i in range(0, 12, 2))
    even_sum = sum(int(digits12[i]) for i in range(1, 12, 2))
    total = odd_sum + (even_sum * 3)
    check_digit = (10 - (total % 10)) % 10
    return check_digit

def generate_ean13(prefix: str, sequence_num: int) -> str:
    """
    Generates a full 13-digit EAN-13 barcode.
    Default prefix: 890 (India / Private Label) + SKU/batch sequence.
    """
    clean_prefix = "".join(filter(str.isdigit, str(prefix))) or "890100"
    seq_str = str(sequence_num)
    
    # Target 12 digits before checksum
    needed_length = 12 - len(clean_prefix)
    if needed_length > 0:
        base12 = clean_prefix + seq_str.zfill(needed_length)[-needed_length:]
    else:
        base12 = clean_prefix[:12]
        
    check_digit = calculate_ean13_checksum(base12)
    return f"{base12}{check_digit}"

def is_valid_ean13(barcode: str) -> bool:
    """
    Validates if a barcode string is a valid EAN-13 with matching checksum.
    """
    if not barcode or len(barcode) != 13 or not barcode.isdigit():
        return False
    expected_check = calculate_ean13_checksum(barcode[:12])
    return int(barcode[12]) == expected_check
