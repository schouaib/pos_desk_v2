//go:build windows

package scale

import (
	"errors"
	"fmt"
	"sync"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	dllOnce     sync.Once
	dllErr      error
	dll         *windows.DLL
	procConnect *windows.Proc
	procDisconn *windows.Proc
	procLoadIni *windows.Proc
	procGetWt   *windows.Proc
	procDlPLU   *windows.Proc
	procClrPLU  *windows.Proc
	procDlHK    *windows.Proc
)

func loadDLL() error {
	dllOnce.Do(func() {
		dll, dllErr = windows.LoadDLL("rtslabelscale.dll")
		if dllErr != nil {
			return
		}
		procConnect, dllErr = dll.FindProc("rtscaleConnect")
		if dllErr != nil {
			return
		}
		procDisconn, dllErr = dll.FindProc("rtscaleDisConnect")
		if dllErr != nil {
			return
		}
		procLoadIni, _ = dll.FindProc("rtscaleLoadIniFile")
		procGetWt, dllErr = dll.FindProc("rtscaleGetPluWeight")
		if dllErr != nil {
			return
		}
		procDlPLU, dllErr = dll.FindProc("rtscaleDownLoadPLU")
		if dllErr != nil {
			return
		}
		procClrPLU, dllErr = dll.FindProc("rtscaleClearPLUData")
		if dllErr != nil {
			return
		}
		procDlHK, _ = dll.FindProc("rtscaleDownLoadHotkey")
	})
	return dllErr
}

func dllConnect(ip string) (int, error) {
	if err := loadDLL(); err != nil {
		return 0, err
	}

	ipBytes, _ := windows.BytePtrFromString(ip)
	var connID int32

	ret, _, _ := procConnect.Call(
		uintptr(unsafe.Pointer(ipBytes)),
		0, // BaudRate=0 for network
		uintptr(unsafe.Pointer(&connID)),
	)
	if int32(ret) < 0 {
		return 0, errors.New("scale connect failed")
	}
	return int(connID), nil
}

func dllDisconnect(connID int) error {
	if err := loadDLL(); err != nil {
		return err
	}
	ret, _, _ := procDisconn.Call(uintptr(int32(connID)))
	if int32(ret) != 0 {
		return errors.New("scale disconnect failed")
	}
	return nil
}

func dllGetWeight(connID int) (float64, error) {
	if err := loadDLL(); err != nil {
		return 0, err
	}
	var weight float64
	ret, _, _ := procGetWt.Call(
		uintptr(int32(connID)),
		uintptr(unsafe.Pointer(&weight)),
	)
	if int32(ret) < 0 {
		return 0, errors.New("failed to get weight")
	}
	return weight, nil
}

func dllClearPLU(connID int) error {
	if err := loadDLL(); err != nil {
		return err
	}
	ret, _, _ := procClrPLU.Call(uintptr(int32(connID)))
	if int32(ret) != 0 {
		return errors.New("failed to clear PLU data")
	}
	return nil
}

func dllDownloadPLU(connID int, jsonData string, packIdx int) error {
	if err := loadDLL(); err != nil {
		return err
	}
	jsonBytes, _ := windows.BytePtrFromString(jsonData)
	ret, _, _ := procDlPLU.Call(
		uintptr(int32(connID)),
		uintptr(unsafe.Pointer(jsonBytes)),
		uintptr(int32(packIdx)),
	)
	if int32(ret) != 0 {
		return fmt.Errorf("failed to download PLU pack %d", packIdx)
	}
	return nil
}

func dllDownloadHotkey(connID int, table []int32, tableIdx int) error {
	if procDlHK == nil {
		return errors.New("hotkey function not available")
	}
	if err := loadDLL(); err != nil {
		return err
	}
	ret, _, _ := procDlHK.Call(
		uintptr(int32(connID)),
		uintptr(unsafe.Pointer(&table[0])),
		uintptr(int32(tableIdx)),
	)
	if int32(ret) != 0 {
		return fmt.Errorf("failed to download hotkey table %d", tableIdx)
	}
	return nil
}
