import serial
import time

try:
    print('Trying to connect to COM5...')
    s = serial.Serial('COM5', 9600, timeout=1)
    print('Connected successfully!')
    time.sleep(2)
    print("Reading data: ", s.readline())
    s.close()
except Exception as e:
    print(f'Failed: {type(e).__name__} - {e}')
