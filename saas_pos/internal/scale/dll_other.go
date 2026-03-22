//go:build !windows

package scale

import "errors"

var errNotWindows = errors.New("scale DLL is only available on Windows")

func loadDLL() error                                      { return errNotWindows }
func dllConnect(ip string) (int, error)                   { return 0, errNotWindows }
func dllDisconnect(connID int) error                      { return errNotWindows }
func dllGetWeight(connID int) (float64, error)            { return 0, errNotWindows }
func dllClearPLU(connID int) error                        { return errNotWindows }
func dllDownloadPLU(connID int, jsonData string, packIdx int) error { return errNotWindows }
func dllDownloadHotkey(connID int, table []int32, tableIdx int) error { return errNotWindows }
