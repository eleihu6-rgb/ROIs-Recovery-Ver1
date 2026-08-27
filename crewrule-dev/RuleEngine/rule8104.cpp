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
// #include "customBiz\customBiz.h"
#include "CustomBiz/CustomBiz.h"

bool LegalityChecker::checkMaxGround(ROSTER * roster){
	bool breturn = true;
	if (roster->pairId != 0){
		return true;
	}

	const vector<DBRule>& rules = this->_dbData->getRuleFunctions(RULES::MAX_GROUND_DP);
	for (std::size_t i = 0; i < rules.size(); i++){
		map<string, string>::const_iterator iter;
		string header, headeValue;
		string assignmentGroupstr, qualifierstr, maxDp;
		vector<string> assignmentGroups, qualifiers;
		int maxDpsec = 0;
		for (iter = rules[i].params.begin(); iter != rules[i].params.end(); iter++)
		{
			header = iter->first;
			headeValue = iter->second;
			if (header == "ASSIGNMENT GROUPS") {
				assignmentGroupstr = headeValue;
				split(assignmentGroupstr, '|', assignmentGroups);
			}
			if (header == "QUALIFIERS") {
				qualifierstr = headeValue;
				split(qualifierstr, '|', qualifiers);
			}
			if (header == "MAX DP") {
				maxDp = headeValue;
				maxDpsec = hhmmToMinutes(maxDp.c_str()) * 60;
			}
		}
		bool assignmentIsOk = false;
		if (assignmentGroups[0] != "*"){
			string assignment = roster->duty;
				for (auto gp : assignmentGroups){
					if (this->_dbData->isAssignmentInGroup(assignment, gp) || assignment == gp){
						assignmentIsOk = true;
						break;
					}
				}
		}
		else{
			assignmentIsOk = true;
		}
		if (!assignmentIsOk)continue;

		if (qualifiers[0] != "*" && find(qualifiers.begin(), qualifiers.end(), roster->qualifier) == qualifiers.end()){
			continue;
		}
		int DpSec = static_cast<int>(roster->getRestStartUtcAct() - roster->getStartTimeUtcAct());

		double pct = 1.0;
		map<string, SharedPtr<ASSIGNMENT>>::iterator dbRosterAssignment = this->_dbData->assignmentNameMap.find(roster->qualifier);
		if (dbRosterAssignment != this->_dbData->assignmentNameMap.end())
			pct = dbRosterAssignment->second->DP_PCT;
		if (pct * DpSec > maxDpsec){
			string msg = "[{0:rosterLabel}] The actual duty period exceeds the MAX allowed duty period of {1:maxDp}.";
			msg = StringUtils::Format(msg, roster->label, maxDp);

			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->crewId = roster->idcrew;//20190706 ain, mantis#6159
			rv->rosterId = roster->rosterId;
			rv->startDTUtc = roster->getStartTimeUtcAct();
			rv->endDTUtc = roster->getEndTimeUtcAct();
			rv->violation_msg = msg;
			rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
			rv->operation_result.insert(pair<string, string>("label", roster->label));
			rv->operation_result.insert(pair<string, string>("maxDp", maxDp));
			this->addRuleViolations(rv, &rules[i]);
			breturn = false;
		}
	}
	return false;
}