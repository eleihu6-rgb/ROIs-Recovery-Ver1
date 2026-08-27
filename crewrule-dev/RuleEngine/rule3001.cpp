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
#include "../utils/StringUtils.h"

bool LegalityChecker::checkMinConnBetwDIP(vector<Segment *>& segments, const vector<DBRule>& rules)
{
	bool isValid = true;
	vector<Segment*> tmpSegments;
	for (size_t i = 0; i < segments.size(); i++)
	{
		Segment* current = segments[i];
        // in PO, segment may come from two places: flight & ferry, search both two places
		auto flightIter = this->_dbData->flightIdMap.find(current->getDBId());
        auto ferryIter = this->_dbData->ferryFltIdMap.find(current->getDBId());
		if ((flightIter != this->_dbData->flightIdMap.end() && flightIter->second != nullptr)
            || (ferryIter != this->_dbData->ferryFltIdMap.end() && ferryIter->second != nullptr)
        ) {
			tmpSegments.push_back(current);
		}
	}

	for (auto& rule : rules)
	{
		auto& parameter = rule.params;
		string header, headeValue;
		string strInType = "*", strOutType = "*", strAirport = "*", strFlt2Ferry = "*", strFerry2Flt = "*", strDhd2Flt = "*";
		string strFlt2Dhd = "*", strMct = "9999", strACChg = "*", strAirlineChg = "*";
		string strFlt2Train = "*", strTrain2Flt = "*";
		string strFleets = "*", strSubFleets = "*", strMaxConn = "*", strFleetGroups = "*", strFleetGroupChange = "*";
		bool bACChg = false;
		for (auto iter = parameter.begin(); iter != parameter.end(); ++iter)
		{
			header = iter->first;
			headeValue = iter->second;
			//transform(header.begin(), header.end(), header.begin(), ::toupper);
			//transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

			if (header == "AIRPORT"&& headeValue.size() > 0) {
				strAirport = headeValue;
			}
			if ((header == "FLEETS" || header == "FLEET CHANGE") && headeValue.size() > 0) {
				strFleets = headeValue;
			}
			if ((header == "SUB FLEETS" || header == "SUB FLEET CHANGE") && headeValue.size() > 0) {
				strSubFleets = headeValue;
			}
			if (header == "FLT2FERRY" && headeValue.size() > 0) {
				strFlt2Ferry = headeValue;
			}
			if (header == "FERRY2FLT" && headeValue.size() > 0) {
				strFerry2Flt = headeValue;
			}
			if (header == "DHD2FLT" && headeValue.size() > 0) {
				strDhd2Flt = headeValue;
			}
			if (header == "FLT2DHD" && headeValue.size() > 0) {
				strFlt2Dhd = headeValue;
			}
			if (header == "FLT2TRAIN" && headeValue.size() > 0) {
				strFlt2Train = headeValue;
			}
			if (header == "TRAIN2FLT" && headeValue.size() > 0) {
				strTrain2Flt = headeValue;
			}
			if ((header == "INBOUND DUTY" || header == "INBOUND SECTOR DIR") && headeValue.size() > 0) {
				strInType = headeValue;
			}
			if ((header == "OUTBOUND DUTY" || header == "OUTBOUND SECTOR DIR") && headeValue.size() > 0) {
				strOutType = headeValue;
			}
			if (header == "AIRCRAFT CHANGE" && headeValue.size() > 0) {
				strACChg = headeValue;
			}
			if (header == "AIRLINE CHANGE" && headeValue.size() > 0) {
				strAirlineChg = headeValue;
			}
			if ((header == "MCT" || header == "MIN CONN") && headeValue.size() > 0) {
				strMct = headeValue;
			}
			if (header == "MAX CONN" && headeValue.size() > 0) {
				strMaxConn = headeValue;
			}
			if (header == "FLEET GROUPS" && headeValue.size() > 0) {
				strFleetGroups = headeValue;
			}
			if (header == "FLEET GROUP CHANGE" && headeValue.size() > 0) {
				strFleetGroupChange = headeValue;
			}
		}

		string airport, currentType, nextType, currentAC, nextAC, strMinConn, currAss, nextAss;
		int iConnMins = isHHmm(strMct.c_str()) ? hhmmToMinutes(strMct.c_str()) : atoi(strMct.c_str());
		int iMaxConnMins = isHHmm(strMaxConn.c_str()) ? hhmmToMinutes(strMaxConn.c_str()) : atoi(strMaxConn.c_str());
		vector<string> fleetList;
		vector<string> subFleetList;
		vector<string> fleetGroupList;
		split(strFleets, '|', fleetList);
		split(strSubFleets, '|', subFleetList);
		split(strFleetGroups, '|', fleetGroupList);

		//检查法规设置行与行之间关系具有关联性的法规，比如有通配符*的设置
		//这类法规，先找特殊设置（非*的设置），如找到，没有必要检查一般设置(*)
		//这类法规设置，是按照一般到特殊的关系，从上到下用表格表示
		//目前法规有3001/3010:MIN_CONN_DIP和CHECK_IN_OUT
		for (size_t i = 0; i + 1 < tmpSegments.size() ; i++)
		{
			Segment* current = tmpSegments[i];
			Segment* next = tmpSegments[i + 1];

			airport = current->getArrStation();
            currentType = current->getDomIntType();
            nextType = next->getDomIntType();
            currentAC = current->getTailNum();
            nextAC = next->getTailNum();
			currAss = current->getAssignment();
			nextAss = next->getAssignment();
			string currAirline = current->getAirline();
			string nextAirline = next->getAirline();

			if (currAss == "SBY" || nextAss == "SBY") {
				//备份任务SBY不做检查
				continue;
			}

			if (!strFleetGroups.empty() && strFleetGroups != "*") {
				if (this->_dbData->fleetMap.find(current->getFleetCD()) != this->_dbData->fleetMap.end()) {
					if (find(fleetGroupList.begin(), fleetGroupList.end(), this->_dbData->fleetMap[current->getFleetCD()].fleetGrp) == fleetGroupList.end())
						continue;
				}

				if (this->_dbData->fleetMap.find(next->getFleetCD()) != this->_dbData->fleetMap.end()) {
					if (find(fleetGroupList.begin(), fleetGroupList.end(), this->_dbData->fleetMap[next->getFleetCD()].fleetGrp) == fleetGroupList.end())
						continue;
				}
			}


			if (!strFleetGroupChange.empty() && strFleetGroupChange != "*") {
				string currFleetGroup;
				string nextFleetGroup;
				auto currFleetIter = this->_dbData->fleetMap.find(current->getFleetCD());
				if (currFleetIter != this->_dbData->fleetMap.end()) {
					currFleetGroup = currFleetIter->second.fleetGrp;
				}
				auto nextFleetIter = this->_dbData->fleetMap.find(next->getFleetCD());
				if (nextFleetIter != this->_dbData->fleetMap.end()) {
					nextFleetGroup = nextFleetIter->second.fleetGrp;
				}

				if (currFleetGroup.empty() || nextFleetGroup.empty()) {
					continue;
				}

				bool isFleetGroupChanged = currFleetGroup != nextFleetGroup;
				if ((isFleetGroupChanged && strFleetGroupChange == "N") ||
					(!isFleetGroupChanged && strFleetGroupChange == "Y")) {
					continue;
				}
			}
			//新增fleet判断，前后航班fleet必须都在列表中
			if (!strFleets.empty() && strFleets != "*") {
				if (find(fleetList.begin(), fleetList.end(), current->getFleetCD()) == fleetList.end()
					|| find(fleetList.begin(), fleetList.end(), next->getFleetCD()) == fleetList.end())
					continue;
			}

			//新增subFleet判断，前后航班subFleet必须都在列表中
			if (!strSubFleets.empty() && strSubFleets != "*") {
				if (find(subFleetList.begin(), subFleetList.end(), current->getSubFleet()) == subFleetList.end()
					|| find(subFleetList.begin(), subFleetList.end(), next->getSubFleet()) == subFleetList.end())
					continue;
			}

			//connect time in minutes
			if (strAirport == "*" || strAirport == airport)
			{
				if ((strInType == "*" || strInType == currentType) && (strOutType == "*" || strOutType == nextType))
				{
					if (strACChg != "*")
					{
						bool changeAc = true;
						if (((currentAC == nextAC) && !currentAC.empty()) ||
							((current->getNextLegNo() == next->getSegNumber()) && !(current->getNextLegNo().empty())) || 
							(!(current->getRegister().empty()) && (current->getRegister() == next->getRegister())))
							changeAc = false;
						//FERRY+FLY/FLY+FERRY Is Not ACChang modified by ZZM
						if ((currAss != "FLY" && currAss != "DHD") || (nextAss != "FLY" && nextAss != "DHD"))
							changeAc = false;
						if ((changeAc && strACChg == "N") || (!changeAc && strACChg == "Y"))
							continue;
						
					}
 					if (strFlt2Ferry == "Y")
						if (!(currAss == "FLY" && nextAss == "BUS"))
							continue;
					if (strFerry2Flt == "Y")
						if (!(currAss == "BUS" && nextAss == "FLY"))
							continue;
					if (strDhd2Flt == "Y")
						if (!(currAss == "DHD" && nextAss == "FLY"))
							continue;
					if (strFlt2Dhd == "Y")
						if (!(currAss == "FLY" && nextAss == "DHD"))
							continue;
					if (strFlt2Train == "Y")
						if (!(currAss == "FLY" && nextAss == "TRAIN"))
							continue;
					if (strTrain2Flt == "Y")
						if (!(currAss == "TRAIN" && nextAss == "FLY"))
							continue;

					if (strAirlineChg == "N")
						if (currAirline != nextAirline)
							continue;

					//20191217 ain, mantis#6136, 3001 连接时间改为按 act utc计算
					//int connTime = (next->getStartTimeLocSch() - current->getEndTimeLocSch()) / 60;
					int connTime = static_cast<int>(next->getStartTimeUtcAct() - current->getEndTimeUtcAct()) / 60;
					if (connTime < iConnMins)
					{
						if (this->_application == PAIRING_OPTIMIZER)
							return false;

						isValid = false;
						string msg = "Actual minimum connection time ({0:connTime}) is less than the standard minimum connection time ({1:iConnMins}) by {2:gap} minutes.";
						msg = StringUtils::Format(msg, Utility::GetInstancePtr()->formatMinutes(connTime),
							Utility::GetInstancePtr()->formatMinutes(iConnMins), 
							Utility::GetInstancePtr()->formatMinutes(connTime - iConnMins));

						tmpSegments[i]->setViolationMessage(msg);
						tmpSegments[i]->setLegality(false);
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->pairingId = current->getPairingId();
						rv->segmentId = current->getDBId();
						rv->idRule = rule.idRule;
						rv->ruleParamId = rule.idRuleParam;
						rv->startDTUtc = current->getStartTimeUtcAct();
						rv->endDTUtc = current->getEndTimeUtcAct();
						rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
						//OP#1448提供message参数给gantt
						rv->operation_result.insert(pair<string, string>("connTime", Utility::GetInstancePtr()->formatMinutes(connTime)));
						rv->operation_result.insert(pair<string, string>("iConnMins", Utility::GetInstancePtr()->formatMinutes(iConnMins)));
						rv->violation_msg = msg;
						this->addRuleViolations(rv, &rule);
					}
					if (!strMaxConn.empty() && strMaxConn != "*" &&  connTime > iMaxConnMins)
					{
						if (this->_application == PAIRING_OPTIMIZER)
							return false;

						isValid = false;
						string msg = "Actual maxmum connection time ({0:connTime}) is more than the standard maxmum connection time ({1:iConnMins}) by {2:gap} minutes.";
						msg = StringUtils::Format(msg, Utility::GetInstancePtr()->formatMinutes(connTime),
							Utility::GetInstancePtr()->formatMinutes(iMaxConnMins),
							Utility::GetInstancePtr()->formatMinutes(connTime - iMaxConnMins));

						tmpSegments[i]->setViolationMessage(msg);
						tmpSegments[i]->setLegality(false);
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->pairingId = current->getPairingId();
						rv->segmentId = current->getDBId();
						rv->idRule = rule.idRule;
						rv->ruleParamId = rule.idRuleParam;
						rv->startDTUtc = current->getStartTimeUtcAct();
						rv->endDTUtc = current->getEndTimeUtcAct();
						rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
						//OP#1448提供message参数给gantt
						rv->operation_result.insert(pair<string, string>("connTime", Utility::GetInstancePtr()->formatMinutes(connTime)));
						rv->operation_result.insert(pair<string, string>("iConnMins", Utility::GetInstancePtr()->formatMinutes(iMaxConnMins)));
						rv->violation_msg = msg;
						this->addRuleViolations(rv, &rule);
					}
					//20181218 yuankai.cai mantis#4628 当匹配到后 直接跳出循环 不再继续匹配
					return isValid;
				}
			}
		}
	}
	return isValid;
}


bool LegalityChecker::checkMinConnBetwDIP(vector<Duty *>& duties, const vector<DBRule>& rules)
{
	bool isValid = true;

	for (auto& duty : duties)
	{
		vector<Segment *> segments = duty->getSegments();
		isValid = checkMinConnBetwDIP(segments, rules);
		if (!isValid && this->_application == PAIRING_OPTIMIZER)
			return false;
	}
	return isValid;
}
