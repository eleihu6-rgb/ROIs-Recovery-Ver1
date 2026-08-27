#ifndef INDEX_2D_ARRAY_H
#define INDEX_2D_ARRAY_H
#include <vector>
#include <map>
#include <string>
using namespace std;

//******************************************************************
//1) 封装 2D array
//2) index类型为 string，如 rank/base/fleet等
//3) 通过 getValue(stringA, stringB)方式查找
//4) 2D array中各元素初始化为0
//******************************************************************
class Index2DArray {
public:
	enum ValueType { ROW, COL };
	Index2DArray();
	Index2DArray(string name);
	~Index2DArray();
	void init(vector<string>& rowNames, vector<string>& colNames);

	//获取 array[row, col]
	int getValue(string& row, string& col);
	int getValue(const char* row, const char* col);
	//设置 array[row, col]
	void setValue(string& row, string& col, int value);
	void setValue(const char* row, const char* col, int value);

	void printLog();
	string printError(string value, ValueType valueType);
private:
	map<string, int> rowNameIndex;
	map<string, int> colNameIndex;
	int * buf;    //2d array buf, 1d array --> 2d index array
	int rowCount; //rows
	int colCount; //columns
	string name;
};


#endif//INDEX_2D_ARRAY_H