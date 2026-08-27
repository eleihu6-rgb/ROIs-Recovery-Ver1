#pragma once

#include "RuleEngine.h"
#include "Utility.h"

#include <time.h>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
//#include <OrLog.h>
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"


/*
   该法规已经专门适用EVA客户，其他客户采用产品标准功能和法规，8121
*/

bool LegalityChecker::checkCrewPreference(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;

	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	string strRequestGroup, strOverrideableGroups, strTypes = "*", strStatus = "*";
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);
		//REQUESTED ASSIGNMENT GROUP,OVERRIDABLE ASSIGNMENT GROUPS
		if (header == "REQUESTED ASSIGNMENT GROUP")
			strRequestGroup = headeValue;
		if (header == "OVERRIDABLE ASSIGNMENT GROUPS")
			strOverrideableGroups = headeValue;
		if (header == "PREF TYPES")
			strTypes = headeValue;
		if (header == "PREF STATUSES")
			strStatus = headeValue;

	}

	vector<string> overrideGroups, statuses, types;
	split(strOverrideableGroups, '|', overrideGroups);
	split(strStatus, '|', statuses);
	split(strTypes, '|', types);
	/*boost::split(overrideGroups, strOverrideableGroups, boost::is_any_of(SPLIT_STRING), boost::token_compress_on);
	boost::split(statuses, strStatus, boost::is_any_of(SPLIT_STRING), boost::token_compress_on);
	boost::split(types, strTypes, boost::is_any_of(SPLIT_STRING), boost::token_compress_on);*/

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	vector<SharedPtr<CREW_BASE>>& bases = crew->baseList;
	vector<SharedPtr<CREW_RANK>>& ranks = crew->rankList;
	vector<SharedPtr<CREW_PREFERENCE>>& preferences = crew->preferenceList;

	int offsetMinutes = this->_dbData->getCrewBaseOffsetMinutes(crew->idCrew, this->_dbData->scenario.startDtUTC);

	string crewId = crew->idCrew;

	time_t lCheckedStart = this->_dbData->scenario.startDtUTC;
	time_t lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;

	string assignment, label, attribute;
	time_t rosterStart, rosterEnd;

	for (vector<SharedPtr<CREW_PREFERENCE>>::iterator preference = preferences.begin(); preference != preferences.end(); ++preference)
	{
		//if ((*preference)->prefType != "MANDATE" && (*preference)->prefType != "CPR")
		//	continue;

		if (strTypes != "*")
		{
			if (std::find(types.begin(), types.end(), (*preference)->prefType) == types.end())
				continue;
		}

		//0003523: SERVER 8052只需要對status=G的紀錄告警
		if (strStatus != "*")
		{
			if (std::find(statuses.begin(), statuses.end(), (*preference)->status) == statuses.end())
				continue;
		}

		if (!(Utility::GetInstancePtr()->isTimeOverlap(lCheckedStart, lCheckedEnd, (*preference)->strDtloc - offsetMinutes * 60, (*preference)->endDtLoc - offsetMinutes * 60 + 24 * 3600 - 1)))
			continue;

		//mantis4550
		if (strRequestGroup != "*" && strRequestGroup != (*preference)->assignment && (*preference)->assignment != "*" && (*preference)->assignment != "")
			continue;

		bool bFoundRoster = false;
		int iMatchedRoster = 0;
		for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); ++roster)
		{
			if (this->_application == ROSTER_OPTIMIZER && !((*roster)->needRuleCheck))
				continue;

			rosterStart = (*roster)->actStrUtc;
			rosterEnd = (*roster)->actRestStrUtc;

			if (!(Utility::GetInstancePtr()->isTimeOverlap(lCheckedStart, lCheckedEnd, rosterStart, rosterEnd)))
				continue;

			auto tempOffsetMinutes = offsetMinutes;
			if ((*preference)->pairingId > 0)
			{
				tempOffsetMinutes = this->_dbData->getAirportOffsetMinutes((*roster)->location);
			}

			if (rosterStart < (*preference)->strDtloc - tempOffsetMinutes * 60 || rosterStart >= (*preference)->endDtLoc - tempOffsetMinutes * 60 + 24 * 3600)
				continue;

			assignment = (*roster)->duty;
			label = (*roster)->label;

			if ((*roster)->pairing)
				attribute = (*roster)->pairing->getAttribute();
			else
				attribute = "";

			bool isNotLegal = false;

			bFoundRoster = true;
			if ((*preference)->pref == "NOT")
			{
				if ((*preference)->assignment == "" || (*preference)->assignment == assignment)
					if ((*preference)->label == "" || (*preference)->label == label)
						if (((*preference)->attribute == "") || (attribute != "" && attribute.find((*preference)->attribute) != string::npos))
							isNotLegal = true;

				// mantis#5217, attribute相符就需要限制
				if ((*preference)->attribute != "" && attribute != "" && attribute.find((*preference)->attribute) != string::npos)
					isNotLegal = true;

				//mantis0001734: 8052，PREF=NOT，assignment、label、attribute都为空时，法规不检查
				//ignore the check for RO
				if ((*preference)->assignment == "" && (*preference)->label == "" && (*preference)->attribute == "" && this->GetApplication() == ROSTER_OPTIMIZER)
					isNotLegal = false;
			}
			else if ((*preference)->pref == "MUST")
			{
				if ((*preference)->assignment != "" && (*preference)->assignment != assignment)
					isNotLegal = true;

				// mantis#5176, 為了八大類mandate的特殊處理, 當attribute不為空即代表八大類
				// 只要attribute相符就可以, assignment不符不告警, 例如preference->assignment是FLY而assignment是RB
				if ((*preference)->attribute != "")
					isNotLegal = attribute != "" && attribute.find((*preference)->attribute) == string::npos;

				if ((*preference)->label != "" && (*preference)->label != label)
					isNotLegal = true;

				if ((*preference)->pairingId > 0 && (*roster)->pairId != (*preference)->pairingId)
				{
					isNotLegal = true;
				}

				//If roster is in the overridable groups, ignore the violation.
				if (std::find(overrideGroups.begin(), overrideGroups.end(), (*roster)->duty) != overrideGroups.end()
					&& (strRequestGroup == (*preference)->assignment || (*preference)->assignment == "*" || (*preference)->assignment == ""))
				{
					isNotLegal = false;
				}
				if (!isNotLegal)
				{
					iMatchedRoster++;
				}
			}
			else
				continue;

			if (isNotLegal)
			{
				if (this->GetApplication() == ROSTER_OPTIMIZER && (*roster)->needRuleCheck == false)
				{
					continue;
				}
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				//string msg = "Current roster type[Assignment=" + assignment + ",label=" + label + ",attribute=" + attribute;
				//msg += "] doesn't match crew preference(ID=" + Utility::GetInstancePtr()->ToString((*preference)->prefId) + ",Pref=" + (*preference)->pref;
				string msg = "[" + label + "] violates with (Pref=" + (*preference)->pref;
				rv->operation_result.insert(pair<string, string>("pref", (*preference)->pref));
				/*if ((*preference)->assignment != ""){
				msg += ",Assignment=" + (*preference)->assignment;
				rv->operation_result.insert(pair<string, string>("assignment", (*preference)->assignment));
				}
				if ((*preference)->pairingId > 0){
				msg += ",Pairing ID=" + Utility::GetInstancePtr()->ToString((*preference)->pairingId);
				rv->operation_result.insert(pair<string, string>("pairingId", Utility::GetInstancePtr()->ToString((*preference)->pairingId)));
				}*/
				if ((*preference)->label != "") {
					msg += ",Label=" + (*preference)->label;
					rv->operation_result.insert(pair<string, string>("label", ",Label=" + (*preference)->label));
				}
				if ((*preference)->attribute != "") {
					string attributeName = (*preference)->attribute;
					if (this->_dbData->attributeNameMap.find((*preference)->attribute) != this->_dbData->attributeNameMap.end())
					{
						attributeName += " ";
						attributeName += this->_dbData->attributeNameMap[(*preference)->attribute];
					}
					msg += ",Attribute=" + attributeName;
					rv->operation_result.insert(pair<string, string>("attribute", ",Attribute=" + attributeName));
				}
				msg += ").";
				rv->operation_result.insert(pair<string, string>("rosterLabel", label));
				//msg += ") with rule parameters[Overridable assignment group=" + strOverrideableGroups + ",requested assignment group=" + strRequestGroup + "].";
				//rv->operation_result.insert(pair<string, string>("strOverrideableGroups", strOverrideableGroups));
				//rv->operation_result.insert(pair<string, string>("strRequestGroup", strRequestGroup));
				pCrew->legalMessage.push_back(msg);
				this->setLegalityMessage(crew, pCrew, singleRule, msg);
				bReturn = false;
				pCrew->isLegal = false;
				pCrew->skipCheckInLaterIterations = true;
				rv->crewId = crew->idCrew;
				rv->rosterId = (*roster)->rosterId;
				rv->pairingId = (*roster)->pairId;
				//rv->dutySequenceNumber = (*duty)->getDutySegNum();
				//rv->segmentId = (*segment)->getDBId();
				rv->startDTUtc = rosterStart;
				rv->endDTUtc = rosterEnd;
				rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
				rv->violation_msg = msg;
				this->addRuleViolations(rv, singleRule);
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}
			}
		}

		if ((*preference)->pref == "MUST" && this->_application != ROSTER_OPTIMIZER)
		{
			int prefDays = static_cast<int>((*preference)->endDtLoc - (*preference)->strDtloc) / (24 * 3600) + 1;
			if ((*preference)->assignment == "OFF")
			{
				// mantis#5218, DO Request若申請N天, 區間內就必須有N天DO
				if (iMatchedRoster == prefDays)
					continue;
			}
			else if ((*preference)->label != "" || (*preference)->pairingId > 0)
			{
				// 找不到指定的FLY就違反申請
				if (iMatchedRoster > 0)
				{
					continue;
				}
			}
			else
			{
				// 全月類型的mandate只需要檢查現有任務是否符合, 不須檢查不存在的任務
				continue;
			}

			string attributeName = (*preference)->attribute;
			if (this->_dbData->attributeNameMap.find((*preference)->attribute) != this->_dbData->attributeNameMap.end())
			{
				attributeName += " ";
				attributeName += this->_dbData->attributeNameMap[(*preference)->attribute];
			}
			//string msg = "No Roster match crew preference(ID=" + Utility::GetInstancePtr()->ToString((*preference)->prefId) + ",Pref=" + (*preference)->pref;
			string msg = "No Roster matches (Pref=" + (*preference)->pref;
			//msg += ",Assignment=" + (*preference)->assignment;
			msg += ",Label=" + (*preference)->label + ",Attribute=" + attributeName + ").";

			pCrew->legalMessage.push_back(msg);
			this->setLegalityMessage(crew, pCrew, singleRule, msg);
			pCrew->isLegal = false;
			pCrew->skipCheckInLaterIterations = true;
			bReturn = false;
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			//OP#1448提供message参数给gantt
			//rv->operation_result.insert(pair<string, string>("prefId", Utility::GetInstancePtr()->ToString((*preference)->prefId)));
			rv->operation_result.insert(pair<string, string>("pref", (*preference)->pref));
			//rv->operation_result.insert(pair<string, string>("assignment", (*preference)->assignment));
			rv->operation_result.insert(pair<string, string>("label", (*preference)->label));
			rv->operation_result.insert(pair<string, string>("attribute", attributeName));
			rv->crewId = crew->idCrew;
			rv->startDTUtc = (*preference)->strDtloc - offsetMinutes * 60;
			rv->endDTUtc = (*preference)->endDtLoc - offsetMinutes * 60;
			if (rv->endDTUtc == rv->startDTUtc)
			{
				rv->endDTUtc += 24 * 3600 - 1;
			}
			rv->type = VIOLATION_TYPE::CREW_VIOLATION;
			rv->violation_msg = msg;
			this->addRuleViolations(rv, singleRule);
		}
	}

	return bReturn;
}
