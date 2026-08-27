#include <stdio.h>
#include <time.h>
#include <iostream>
#include <sstream>
#include <fstream>
#include <string>
#include "CrewDB.h"
#include "UtilFunc.h"
#include "OrLog.h"



void test_index_crew_base() {
	struct crew_base_t {
		string start;
		string end;
		time_t startT;
		time_t endT;
		string base;
	};
	vector<crew_base_t> list = {
		{ "2017-1-1", "2017-1-31", 0, 0, "PEK" },
		{ "2017-1-15", "2017-2-28", 0, 0, "SHA" }
	};
	for (auto& item : list) {
		item.startT = utcStrToUtc((char*)item.start.c_str());
		item.endT = utcStrToUtc((char*)item.end.c_str());
	}
	//index: crew_base
	DatePeriodIndex index;
	//1、汇总时间点
	for (auto& item : list) {
		time_t start = utcStrToUtc((char*)item.start.c_str());
		time_t end = utcStrToUtc((char*)item.end.c_str()) + 24 * 3600;
		index.addByLocalTime(item.base, start, end);
	}

	//打印索引
	for (auto& item : list) {
		cout << "data " << item.start << " " << item.end << " " << item.base << endl;
	}
	cout << endl;
	index.printIndex();

	//测试检查
	vector<crew_base_t> checkList = {
		{ "2000-12-31", "2001-10-31", 0, 0, "PEK" },
		{ "2016-12-31", "2017-12-31", 0, 0, "PEK" },
		{ "2017-1-2", "2017-1-30", 0, 0, "PEK" },
		{ "2017-1-15", "2017-2-14", 0, 0, "FOC" },
		{ "2017-2-15", "2017-2-15", 0, 0, "FOC" },
		{ "2017-5-31", "2017-5-31", 0, 0, "FOC" },
		{ "2017-6-1", "2017-6-1", 0, 0, "FOC" },
		{ "2017-1-15", "2017-2-15", 0, 0, "XMN" },
		{ "2017-3-1", "2017-6-30", 0, 0, "SHA" },
		{ "2018-6-1", "2018-6-30", 0, 0, "SHA" }
	};
	for (auto& item : checkList) {
		item.startT = utcStrToUtc((char*)item.start.c_str());
		item.endT = utcStrToUtc((char*)item.end.c_str());
	}
#define MAX_TURN 100
	clock_t t0 = clock();
	for (int i = 0; i < MAX_TURN; i++) {
		for (auto& item : checkList) {
			time_t start = utcStrToUtc((char*)item.start.c_str());
			time_t end = utcStrToUtc((char*)item.end.c_str()) + 24 * 3600;
			int startYYYYMMDD = timeToYYYYMMDD(start);
			int endYYYYMMDD = timeToYYYYMMDD(end);

			bool found = index.check(item.base, startYYYYMMDD, endYYYYMMDD);
		}
	}
	clock_t t1 = clock();
	cout << "clock DatePeriodIndex " << (t1 - t0) << endl;


	clock_t t2 = clock();
	for (int i = 0; i < MAX_TURN; i++) {
		for (auto& data : checkList) {
			time_t start = utcStrToUtc((char*)data.start.c_str());
			time_t end = utcStrToUtc((char*)data.end.c_str()) + 24 * 3600;

			for (auto& index : list) {
				if (index.base == data.base && index.startT < data.endT && index.endT > data.startT) {
					bool found = true;
					break;
				}
			}
		}
	}
	clock_t t3 = clock();
	cout << "clock OldWay " << (t3 - t2) << endl;
}

void test_index_crew_base2() {

	struct crew_base_t {
		string start;
		string end;
		time_t startT;
		time_t endT;
		string base;
	};
	vector<crew_base_t> list = {
		//{ "2015-1-1", "2015-1-31", 0, 0, "PEK" },
		//{ "2015-1-15", "2015-2-28", 0, 0, "SHA" },
		//{ "2015-3-1", "2015-3-31", 0, 0, "PEK" },
		//{ "2015-4-15", "2015-4-28", 0, 0, "SHA" },
		//{ "2015-1-1", "2015-1-31", 0, 0, "PEK" },
		//{ "2015-1-15", "2015-2-28", 0, 0, "SHA" },
		//{ "2015-3-1", "2015-3-31", 0, 0, "PEK" },
		//{ "2015-4-15", "2015-4-28", 0, 0, "SHA" },

		//{ "2015-1-1", "2015-1-31", 0, 0, "PEK" },
		//{ "2015-1-15", "2015-2-28", 0, 0, "SHA" },
		//{ "2015-3-1", "2015-3-31", 0, 0, "PEK" },
		//{ "2015-4-15", "2015-4-28", 0, 0, "SHA" },
		//{ "2016-1-1", "2016-1-31", 0, 0, "PEK" },
		//{ "2016-1-15", "2016-2-28", 0, 0, "SHA" },
		//{ "2016-3-1", "2016-3-31", 0, 0, "PEK" },
		//{ "2016-4-15", "2016-4-28", 0, 0, "SHA" },
		//{ "2017-1-1", "2017-1-31", 0, 0, "PEK" },
		//{ "2017-1-15", "2017-2-28", 0, 0, "SHA" }
	};
	for (auto& item : list) {
		item.startT = utcStrToUtc((char*)item.start.c_str());
		item.endT = utcStrToUtc((char*)item.end.c_str());
	}
	//index: crew_base
	TimePeriodIndex index;
	for (auto& item : list) {
		time_t start = utcStrToUtc((char*)item.start.c_str());
		time_t end = utcStrToUtc((char*)item.end.c_str()) + 24 * 3600;
		index.addByUtcTime(item.base, start, end);
	}
	//打印索引
	for (auto& item : list) {
		cout << "data " << item.start << " " << item.end << " " << item.base << endl;
	}
	cout << endl;
	index.printIndex();

	//测试检查
	vector<crew_base_t> checkList = {
		{ "2000-12-31", "2001-10-31", 0, 0, "PEK" },
		{ "2016-12-31", "2017-12-31", 0, 0, "PEK" },
		{ "2017-1-2", "2017-1-30", 0, 0, "PEK" },
		{ "2017-1-15", "2017-2-14", 0, 0, "FOC" },
		{ "2017-2-15", "2017-2-15", 0, 0, "FOC" },
		{ "2017-5-31", "2017-5-31", 0, 0, "FOC" },
		{ "2017-6-1", "2017-6-1", 0, 0, "FOC" },
		{ "2017-1-15", "2017-2-15", 0, 0, "XMN" },
		{ "2017-3-1", "2017-6-30", 0, 0, "SHA" },
		{ "2018-6-1", "2018-6-30", 0, 0, "SHA" }
	};
	for (auto& item : checkList) {
		item.startT = utcStrToUtc((char*)item.start.c_str());
		item.endT = utcStrToUtc((char*)item.end.c_str());
	}
#define MAX_TURN2 1000000
	clock_t t0 = clock();
	for (int i = 0; i < MAX_TURN2; i++) {
		for (auto& item : checkList) {
			time_t start = item.startT;
			time_t end = item.endT + 24 * 3600;

			bool found = index.check(item.base, start, end);
			//cout << (found ? "" : "NOT ") << "Found " << item.base << " " << utcToUtcString(start) << endl;

		}
	}
	clock_t t1 = clock();
	cout << "clock DatePeriodIndex (start,end) " << (t1 - t0) << endl;


	clock_t t4 = clock();
	for (int i = 0; i < MAX_TURN2; i++) {
		for (auto& item : checkList) {
			time_t start = item.startT;
			time_t end = item.endT + 24 * 3600;

			bool found = index.check(item.base, start);
			//cout << (found ? "" : "NOT ") << "Found " << item.base << " " << utcToUtcString(start) << endl;

		}
	}
	clock_t t5 = clock();
	cout << "clock DatePeriodIndex (start) " << (t5 - t4) << endl;

	clock_t t2 = clock();
	for (int i = 0; i < MAX_TURN2; i++) {
		for (auto& data : checkList) {
			bool found = false;
			for (auto& index : list) {
				if (index.base == data.base && index.startT < data.endT && index.endT >= data.startT) {
					found = true;
					break;
				}
			}
			//cout << (found ? "" : "NOT ") << "Found " << data.base << " " << utcToUtcString(start) << "  " << utcToUtcString(end) << endl;

		}
	}
	clock_t t3 = clock();
	cout << "clock OldWay " << (t3 - t2) << endl;
	getchar();
}


vector<int> g_list;
vector<int>& test_vector() {
	for (int i = 0; i < 10; i++)
		g_list.push_back(i);
	return g_list;
}