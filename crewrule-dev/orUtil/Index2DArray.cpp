#include <sstream>
#include <iostream>
#include <iomanip>
#include "Index2DArray.h"
#include <cstring>
#include "Log/Logger.h"

using namespace std;


Index2DArray::Index2DArray() {
}
Index2DArray::Index2DArray(string name) : name(name){
}
Index2DArray::~Index2DArray() {
	this->rowNameIndex.clear();
	this->colNameIndex.clear();
	if (this->buf)
		delete[] this->buf;
	this->buf = 0;
}
void Index2DArray::init(vector<string>& rowNames, vector<string>& colNames) {

	//name index
	for (int i = 0; i < (int)rowNames.size(); i++) {
		rowNameIndex[rowNames[i]] = i;
	}
	for (int i = 0; i < (int)colNames.size(); i++) {
		colNameIndex[colNames[i]] = i;
	}

	//row/col count
	this->rowCount = (int)rowNames.size();
	this->colCount = (int)colNames.size();
	//buf
	this->buf = new int[rowCount * colCount];
	memset(buf, 0, sizeof(int) * rowCount * colCount);
}

int Index2DArray::getValue(const char* row, const char* col) {
	string rowStr = row;
	string colStr = col;
	return getValue(rowStr, colStr);
}
//获取 array[row, col]的value
int Index2DArray::getValue(string& row, string& col) {
	if (rowNameIndex.empty() || colNameIndex.empty()) {
		Logger::getRuleLogger()->error("EXCEPTION: invalid parameter, rowNameIndex is empty in Index2DArray::setValue");
		throw "Index2DArray not init, get fail";
	}
	if (rowNameIndex.find(row) == rowNameIndex.end()) {
		throw printError(row, ROW);
	}
	if (colNameIndex.find(col) == colNameIndex.end()) {
		throw printError(col, COL);
	}
	int rowI = rowNameIndex[row];
	int colI = colNameIndex[col];
	return buf[rowI * colCount + colI];
}

void Index2DArray::setValue(const char* row, const char* col, int value) {
	string rowStr = row;
	string colStr = col;
	return setValue(rowStr, colStr, value);
}
//赋值 array[row, col]的value
void Index2DArray::setValue(string& row, string& col, int value) {
	if (rowNameIndex.empty() || colNameIndex.empty()) {
		Logger::getRuleLogger()->error("EXCEPTION: invalid parameter, rowNameIndex is empty in Index2DArray::setValue");
		Logger::getRuleLogger()->error("Index2DArray not init, set fail");
		return;
	}
	if (rowNameIndex.find(row) == rowNameIndex.end()) {
		Logger::getRuleLogger()->error(printError(row, ROW));
		return;
	}
	if (colNameIndex.find(col) == colNameIndex.end()) {
		Logger::getRuleLogger()->error(printError(col, COL));
		return;		
	}
	int rowI = rowNameIndex[row];
	int colI = colNameIndex[col];
	buf[rowI * colCount + colI] = value;
}


void Index2DArray::printLog() {
	if (rowNameIndex.empty() || colNameIndex.empty()) {
		Logger::getRuleLogger()->error("Index2DArray not init");
		return;
	}
	string * rowNames = new string[rowCount];
	string * colNames = new string[colCount];
	for (auto& e : rowNameIndex) {
		rowNames[e.second] = e.first;
	}
	for (auto& e : colNameIndex) {
		colNames[e.second] = e.first;
	}

	cout << setw(6) << " ";
	for (int i = 0; i < colCount; i++)
		cout << setw(5) << colNames[i];;
	cout << endl;

	for (int i = 0; i < rowCount; i++) {
		cout << setw(5) << rowNames[i] << " ";
		for (int j = 0; j < rowCount; j++) {
			cout << setw(5) << buf[i * colCount + j];
		}
		cout << endl;
	}
}


string Index2DArray::printError(string value, ValueType valueType) {
	stringstream ss;
	if (valueType == ROW) {
		string type = name == "" ? "row" : name;
		ss << "Index2DArray invalid param, " << type << "='" << value << "' not found in [";
		for (auto& it : rowNameIndex) {
			ss << it.first << ",";
		}
		ss << "]";
		Logger::getRuleLogger()->error("EXCEPTION: {}", ss.str());

	}
	else {
		string type = name == "" ? "col" : name;
		ss << "Index2DArray invalid param, " << type << "='" << value << "' not found in [";
		for (auto& it : colNameIndex) {
			ss << it.first << ",";
		}
		ss << "]";
		Logger::getRuleLogger()->error("EXCEPTION: {}", ss.str());
	}
	return ss.str();
}
