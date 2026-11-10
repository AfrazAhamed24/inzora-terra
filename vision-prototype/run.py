#!/usr/bin/env python3
"""
INZORA-X Vision System — Run from project root
Usage: python main.py
"""
import os
import sys

# Ensure project root is on path so 'from inzora_vision import ...' works
_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _DIR)

from inzora_vision.main import main

if __name__ == "__main__":
    main()
