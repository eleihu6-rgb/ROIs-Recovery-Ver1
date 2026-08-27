#pragma once

#include "RuleEngine.h"
#include "Utility.h"

#include <time.h>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
// #include "orlog.h"
#include <OrLog.h>
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "utils/StringUtils.h"
#include "../utils/PhaseUtils.h"
// #include "customBiz\customBiz.h"
#include "CustomBiz/CustomBiz.h"

namespace {
int getRosterGroupGapMinutes(const shared_ptr<ROSTER>& prevRoster, const shared_ptr<ROSTER>& nextRoster) {
	if (!prevRoster || !nextRoster) {
		return 0;
	}
	int gap = static_cast<int>((nextRoster->getStartTimeUtcAct() - prevRoster->getRestStartUtcAct()) / 60);
	return max(gap, 0);
}

bool isGroupGapRangeMatched(const int groupGapMinutes, const int lowerMinutes, const int upperMinutes) {
	if (lowerMinutes >= 0 && groupGapMinutes < lowerMinutes) {
		return false;
	}
	if (upperMinutes >= 0 && groupGapMinutes >= upperMinutes) {
		return false;
	}
	return true;
}
}

//判断两相邻任务是否符合 8107，即是否需 mergeFDP, 是否应忽略 2124/2125违规警告
bool isRosterMatch8107(shared_ptr<ROSTER>& prevRoster, shared_ptr<ROSTER>& nextRoster, CrewDataContext* dbData) {

	//if (prevRoster->rosterId == 24067266 || nextRoster->rosterId == 24067269)
	//	printf("");

	if (!prevRoster || !nextRoster) {
		return false;
	}

	//20230607:两个Roster不重叠，则不合并执勤期和飞时计算
	if (!(Utility::GetInstancePtr()->isTimeOverlap(prevRoster->actStrUtc, prevRoster->actEndUtc, nextRoster->actStrUtc, nextRoster->actEndUtc)))
		return false;

	bool match8107 = false;
	const vector<DBRule>& rules = dbData->getRuleFunctions(RULES::ROSTER_FDP_MERGE);
	const int groupGapMinutes = getRosterGroupGapMinutes(prevRoster, nextRoster);
	for (const auto& rule:rules){
		const auto& parameters = rule.params;
		string assignmentA, assignmentB, qualifierA, qualifierB;
		string groupGapRange = "*";
		int groupGapRangeLowerMinutes = -1;
		int groupGapRangeUpperMinutes = -1;
		bool mergeDuty = true;
		for (auto iter : parameters)
		{
			string header = iter.first;
			header = trim(header);
			string headeValue = trim(iter.second);//20191011 ain, trim
			if (header == "ASSIGNMENT GROUP A") {
				assignmentA = headeValue;
			}
			if (header == "ASSIGNMENT GROUP B") {
				assignmentB = headeValue;
			}
			if (header == "QUALIFIER A") {
				qualifierA = headeValue;
			}
			if (header == "QUALIFIER B") {
				qualifierB = headeValue;
			}
			if (header == "GROUP GAP RANGE") {
				groupGapRange = headeValue;
				if (groupGapRange != "*") {
					vector<string> splitstrs;
					split(groupGapRange.c_str(), '-', splitstrs);
					if (splitstrs.size() >= 2) {
						splitstrs[0] = trim(splitstrs[0]);
						splitstrs[1] = trim(splitstrs[1]);
						if (splitstrs[0] != "*") {
							groupGapRangeLowerMinutes = hhmmToMinutes(splitstrs[0].c_str());
						}
						if (splitstrs[1] != "*") {
							groupGapRangeUpperMinutes = hhmmToMinutes(splitstrs[1].c_str());
						}
					}
				}
			}
			if (header == "MERGE DUTY"){
				mergeDuty = headeValue == "Y";
			}
		}
		if (!mergeDuty)continue;
		if (!isGroupGapRangeMatched(groupGapMinutes, groupGapRangeLowerMinutes, groupGapRangeUpperMinutes)) continue;

		//单向
		/*string s1 = prevRoster->duty;
		string s2 = nextRoster->duty;
		bool f1 = prevRoster->duty == assignmentA;
		bool f2 = nextRoster->duty == assignmentB;*/
		string prevRosterAssignment = prevRoster->duty;
		if (prevRoster->isMergeFdpWithFly) {
			prevRosterAssignment = prevRoster->mergeFdpAssignment;
		}	
		string nextRosterAssignment = nextRoster->duty;
		if (nextRoster->isMergeFdpWithFly) {
			nextRosterAssignment = nextRoster->mergeFdpAssignment;
		}

		if (((dbData->isAssignmentInGroup(prevRosterAssignment, assignmentA) || prevRosterAssignment == assignmentA || assignmentA == "*") && (prevRoster->qualifier == qualifierA || qualifierA == "*")
			&& (dbData->isAssignmentInGroup(nextRosterAssignment, assignmentB) || nextRosterAssignment == assignmentB || assignmentB == "*") && (nextRoster->qualifier == qualifierB || qualifierB == "*"))){
			match8107 = true;
			break;
		}
		//双向
		//if (((dbData->isAssignmentInGroup(prevRoster->duty, assignmentA) || prevRoster->duty == assignmentA || assignmentA == "*") && (prevRoster->qualifier == qualifierA || qualifierA == "*")
		//	&& (dbData->isAssignmentInGroup(nextRoster->duty, assignmentB) || nextRoster->duty == assignmentB || assignmentB == "*") && (nextRoster->qualifier == qualifierB || qualifierB == "*"))
		//	|| ((dbData->isAssignmentInGroup(prevRoster->duty, assignmentB) || prevRoster->duty == assignmentB || assignmentB == "*") && (prevRoster->qualifier == qualifierB || qualifierB == "*")
		//	&& (dbData->isAssignmentInGroup(nextRoster->duty, assignmentA) || nextRoster->duty == assignmentA || assignmentA == "*") && (nextRoster->qualifier == qualifierA || qualifierA == "*"))){
		//	match8107 = true;
		//	break;
		//}
	}
	return match8107;
}

//判断两相邻任务是否符合 8107，即是否需 merge
//mergeType: FDP or DP
rule8107 matchRoster8107RuleParam(shared_ptr<ROSTER>& prevRoster, shared_ptr<ROSTER>& nextRoster, string mergeType, CrewDataContext* dbData) {

	//if (prevRoster->rosterId == 24067266 || nextRoster->rosterId == 24067269)
	//	printf("");

	if (!prevRoster || !nextRoster) {
		return {};
	}

	//20230607:两个Roster不重叠，则不合并执勤期和飞时计算
	if (!(Utility::GetInstancePtr()->isTimeOverlap(prevRoster->actStrUtc, prevRoster->actEndUtc, nextRoster->actStrUtc, nextRoster->actEndUtc)))
		return {};


	const vector<DBRule>& rules = dbData->getRuleFunctions(RULES::ROSTER_FDP_MERGE);
	const int groupGapMinutes = getRosterGroupGapMinutes(prevRoster, nextRoster);
	for (const auto& rule : rules) {
		rule8107* ruleParam = (rule8107*)rule.parsedParam.get();

		if (mergeType == "DP" && !ruleParam->isMergeDp)
			continue;
		else if (mergeType == "FDP" && !ruleParam->isMergeFdp)
			continue;
		if (!isGroupGapRangeMatched(groupGapMinutes, ruleParam->groupGapRangeLowerMinutes, ruleParam->groupGapRangeUpperMinutes))
			continue;
		
		if (prevRoster != nullptr && !PhaseUtils::IsChecked(prevRoster.get(), rule.phase, dbData)) {
			continue;
		}

		if (nextRoster != nullptr && !PhaseUtils::IsChecked(nextRoster.get(), rule.phase, dbData)) {
			continue;
		}

		string prevRosterAssignment = prevRoster->qualifier;
	
		string nextRosterAssignment = nextRoster->qualifier;

		if ((ruleParam->assignmentA == "*" || dbData->isAssignmentInGroup(prevRosterAssignment, ruleParam->assignmentA)) && (ruleParam->qualifierA == "*" || ruleParam->qualifierA == prevRosterAssignment)
			&& (ruleParam->assignmentB == "*"  || dbData->isAssignmentInGroup(nextRosterAssignment, ruleParam->assignmentB) && (ruleParam->qualifierB == "*" || ruleParam->qualifierB == nextRosterAssignment)))
			return *ruleParam;

		
	}
	return {};
}


