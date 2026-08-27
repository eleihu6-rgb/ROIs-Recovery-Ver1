#ifndef RULE3010_CALCULATOR_H
#define RULE3010_CALCULATOR_H

#include <string>
#include <map>
#include <vector>
#include <memory>
using namespace std;

//计算 duty.brief/debrief/pickup/dropoff
//1、按duty.startAirport / startLoc时间范围 / dutyType在3010中寻找匹配duty的param row
//2、根据duty中第一个segment决定匹配类型FLY / DHD / Train / Other

//inner struct
struct Rule3010Item {
	string airport;
	vector<string> fltNumbers;
	int dutyStartLocRangeBeginHHmm = 0;
	int dutyEndLocRangeBeginHHmm = 0;
	string dutyType;
	int flyBriefMinutes = 0;
	int flyDebriefMinutes = 0;
	int dhdBriefMinutes = 0;
	int dhdDebriefMinutes = 0;
	int trainBriefMinutes = 0;
	int trainDebriefMinutes = 0;
	int otherBriefMinutes = 0;
	int otherDebriefMinutes = 0;
	int pickupMinutes = 0;
	int dropMinutes = 0;
};

//result struct
struct Rule3010Result {
	int briefMinutes = 0;
	int debriefMinutes = 0;
	int pickupMinutes = 0;
	int dropMinutes = 0;
};

//class
class Rule3010 {
public:
	Rule3010(long long ruleId, vector<map<string, string>>& ruleParams);
	Rule3010();
	void init(long long ruleId, vector<map<string, string>>& ruleParams);
	Rule3010Result findMatch(string firstSegmentFltNumber, string startAirport, string endAirport, time_t dutyStartLoc, string& region, string firstSegmentAssignment, string lastSegmentAssignment);
	void print();
private:
	Rule3010Item* findMatchInternal(string firstSegmentFltNumber, string dutyStartAirport, time_t dutyStartLoc, string region);
	long long ruleId = -1;
	map<string, vector<Rule3010Item>> airportMap;
};
#endif