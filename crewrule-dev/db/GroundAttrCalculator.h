#ifndef GROUND_ATTR_CALCULATOR_H
#define GROUND_ATTR_CALCULATOR_H

#include <string>
#include <vector>
#include <sstream>
#include <map>
#include <unordered_map>
#include <unordered_set>

#include "CrewDB.h"

// Ground属性计算器，用于处理roster中pairing为空的情况（如地面任务、 standby等）
class GroundAttributeCalculator {
public:
	GroundAttributeCalculator(string airline, map<string, DBAirport*>& airportCodeMap, unordered_map<string, unordered_set<string>>& assignmentNameGroupMap,
		map<string, SharedPtr<ASSIGNMENT>>& assignmentNameMap,
		vector<SharedPtr<TAG_CATEGORY>> tagCategoryList,
		map<long long, vector<SharedPtr<TAG_ROSTER_GROUND>>> tagRosterGroundGroupMap, map<long long, vector<SharedPtr<TAG_GROUP>>> tagGroupTableMap,
		map<long long, TAG *> tagGroupMap);

	string calculateGroundTag(SharedPtr<ROSTER>& roster); //计算 tag, 不赋值roster.attribute
	void calculateAndSetGroundTag(vector<SharedPtr<ROSTER>>& rosters); //计算并赋值roster.attribute

private:
	bool appendTableTag(SharedPtr<ROSTER>& roster, string tableCondition, long long groupId);
	bool appendRosterGroundTag(SharedPtr<ROSTER>& roster, vector<SharedPtr<TAG_ROSTER_GROUND>> tagRosterGrounds, string condition);

	bool isGround(SharedPtr<ROSTER>& roster); //判断是否为Ground（pairing为空）

	bool isAssignmentInGroup(string assignment, string group);

	string airline;
	map<string, DBAirport*> airportCodeMap;
	unordered_map<string, unordered_set<string>> assignmentNameGroupMap;
	map<string, SharedPtr<ASSIGNMENT>> assignmentNameMap;
	map<string, SharedPtr<TAG_CATEGORY>> tagCodeMap;
	map<long long, SharedPtr<TAG_CATEGORY>> tagIdMap;
	map<long long, vector<SharedPtr<TAG_ROSTER_GROUND>>> tagRosterGroundGroupMap;
	map<long long, vector<SharedPtr<TAG_GROUP>>> tagGroupTableMap;
	map<long long, TAG *> tagGroupMap;
};

#endif GROUND_ATTR_CALCULATOR_H
