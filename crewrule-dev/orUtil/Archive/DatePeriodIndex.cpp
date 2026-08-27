#include "DatePeriodIndex.h"
#include "time64.h"
#include "UtilFunc.h"

int timeToYYYYMMDD(time_t t) {
	tm m;
	//gmtime_s(&m, &t);
	m = *gmtime_64(t);
	return (m.tm_year + 1900) * 10000 + (m.tm_mon + 1) * 100 + m.tm_mday;
}

map<string, map<time_t, bool>>& TimePeriodIndex::getTreeMap() {
	return this->index;
}
void TimePeriodIndex::printIndex() {
	for (auto& item : index) {
		for (auto& it : item.second) {
			if (it.first == 0 || it.first == item.second.rbegin()->first) //skip first 1970-1-1 and last 9999-12-31
				continue;
			cout << "index " << item.first << " : " << utcToUtcString(it.first);
			if (it.second)
				cout << " +";
			cout << endl;
		}
	}
	cout << endl;
}
void TimePeriodIndex::addByUtcTime(string& value, time_t startUtc, time_t endUtc) {
	if (index.find(value) == index.end())
		initValue(value);
	map<time_t, bool> intervalTree = index[value];
	if (intervalTree.find(startUtc) == intervalTree.end())
		intervalTree[startUtc] = true;
	if (intervalTree.find(endUtc) == intervalTree.end())
		intervalTree[endUtc] = false;
	auto lower = intervalTree.lower_bound(startUtc);
	auto upper = intervalTree.lower_bound(endUtc);

	for (auto& it = lower; it != upper; it++) {
		time_t yyyymmdd = it->first;
		it->second = true;
	}

}

bool TimePeriodIndex::check(string& value, time_t utc) {
	if (index.find(value) == index.end())
		return false;

	map<time_t, bool>& segmentMap = index[value];
	auto lower = segmentMap.lower_bound(utc);
	if (lower->first > utc && lower != segmentMap.begin()) {
		lower--;
	}

	return lower->second;
}
bool TimePeriodIndex::check(string &value, time_t startUtc, time_t endUtc) {

	if (index.find(value) == index.end())
		return false;

	map<time_t, bool>& segmentMap = index[value];
	auto lower = segmentMap.lower_bound(startUtc);
	auto upper = segmentMap.find(endUtc) == segmentMap.end() ? segmentMap.upper_bound(endUtc) : segmentMap.find(endUtc);
	if (lower->first > startUtc && lower != segmentMap.begin()) {
		lower--;
	}

	if (lower != upper) {
		for (auto& it = lower; it != upper; it++) {
			if (it->second) {
				return true;
			}
		}
	}
	return false;
}
void TimePeriodIndex::initValue(string& value) {
	index[value] = map<time_t, bool>();
	index[value][0] = false;
	index[value][utcStrToUtc("9999-12-31")] = false;
}




void DatePeriodIndex::printIndex() {

	for (auto& item : index) {
		for (auto& it : item.second) {
			cout << "index " << item.first << " : " << it.first;
			if (it.second)
				cout << " +";
			cout << endl;
		}
	}
	cout << endl;
}
void DatePeriodIndex::addByLocalTime(string& value, time_t startTime, time_t endTime) {
	int startYYYYMMDD = timeToYYYYMMDD(startTime);
	int endYYYYMMDD = timeToYYYYMMDD(endTime);
	this->addByYYYYMMDD(value, startYYYYMMDD, endYYYYMMDD);
}
void DatePeriodIndex::addByYYYYMMDD(string& value, int startYYYYMMDD, int endYYYYMMDD) {
	if (index.find(value) == index.end())
		initValue(value);
	map<int, bool>& intervalTree = index[value];
	if (intervalTree.find(startYYYYMMDD) == intervalTree.end())
		intervalTree[startYYYYMMDD] = true;
	if (intervalTree.find(endYYYYMMDD) == intervalTree.end())
		intervalTree[endYYYYMMDD] = false;
	auto lower = intervalTree.lower_bound(startYYYYMMDD);
	auto upper = intervalTree.lower_bound(endYYYYMMDD);

	for (auto& it = lower; it != upper; it++) {
		int yyyymmdd = it->first;
		it->second = true;
	}

}
bool DatePeriodIndex::check(string &value, int startYYYYMMDD, int endYYYYMMDD) {

	if (index.find(value) == index.end())
		return false;

	map<int, bool>& segmentMap = index[value];
	auto lower = segmentMap.lower_bound(startYYYYMMDD);
	auto upper = segmentMap.find(endYYYYMMDD) == segmentMap.end() ? segmentMap.upper_bound(endYYYYMMDD) : segmentMap.find(endYYYYMMDD);
	if (lower->first > startYYYYMMDD && lower != segmentMap.begin()) {
		lower--;
	}

	if (lower != upper) {
		for (auto& it = lower; it != upper; it++) {
			int yyyymmdd = it->first;
			if (it->second) {
				return true;
			}
		}
	}
	return false;
}
void DatePeriodIndex::initValue(string& value) {
	index[value] = map<int, bool>();
	index[value][00000000] = false;
	index[value][99999999] = false;
}
