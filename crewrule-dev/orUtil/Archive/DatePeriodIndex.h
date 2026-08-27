#ifndef INTERVAL_TREE_H
#define INTERVAL_TREE_H
#include <string>
#include <map>
#include <vector>
#include <iostream>

using namespace std;

//**************************************************************************************************
//说明
//1、通过IntervalTree实现时间段型匹配
//2、性能：IntervalTree 性能测试，索引长度超过4时才有价值
//  下表为不同索引长度下 IntervalTree和原始 list查找对比
//	索引size                16      8      4       2        0
//	tree查找(start / end)   384     375    356     334      120
//	tree查找(start)         289     289    279     271      113
//	list顺次对比            1192    714    200     94        9
//**************************************************************************************************

//索引为 time_t格式
class TimePeriodIndex {
public:
	void addByUtcTime(string& value, time_t startTime, time_t endTime); //左开右闭区间: [start, end)
	bool check(string& value, time_t startUtc, time_t endUtc); //左开右闭区间: [start, end)
	bool check(string& value, time_t utc); 
	void printIndex(); //for dbg
	map<string, map<time_t, bool>>& getTreeMap();
private:
	void initValue(string& value);
	map<string, map<time_t, bool>> index;
};

//索引为 YYYYMMDD格式, 如 '2017-1-1' -> 20170101
class DatePeriodIndex {
public:
	void addByYYYYMMDD(string& value, int startYYYYMMDD, int endYYYYMMDD); //左开右闭区间: [start, end)
	void addByLocalTime(string& value, time_t startTime, time_t endTime); //左开右闭区间: [start, end)
	bool check(string& value, int startYYYYMMDD, int endYYYYMMDD);       //左开右闭区间: [start, end)
	void printIndex(); //for dbg
private:
	void initValue(string& value);
	map<string, map<int, bool>> index;
};

int timeToYYYYMMDD(time_t t);

#endif//INTERVAL_TREE_H