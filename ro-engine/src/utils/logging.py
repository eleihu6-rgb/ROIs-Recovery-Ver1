# src/utils/logging.py
import logging

logger = logging.getLogger("ro-engine")
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
