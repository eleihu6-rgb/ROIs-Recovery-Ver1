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
#include "utils/RosterUtils.h"
#include "utils/DutyUtils.h"
#include "../utils/PhaseUtils.h"

//map<string, pair<shared_ptr<roster_space>, shared_ptr<roster_space>>> g_rule8056_cache;//key=ruleId+tableNum+rowNum, value=pair<A,B>


/*
	任务间隔检查规则:两种类型任务环/Roster之间的间隔要求
	2020.2.9
	法规ID：8056
	参数：
		BASES/RANKS/FLEETS 组员的基地、等级、机型过滤条件，支持以竖线|分隔多选设置，逻辑关系是OR关系，参数之间是AND关系。
		ATTRIBUTE A：前一个ROSTER的标签
		LABEL A：前一个ROSTER的备注
		IS REQUESTED A：是否属于组员申请任务
		ASSIGNMENT GROUP A:任务环的ASSIGNMENT组，如FLY
		QUALIFIER A：特殊资质代码（属于EVA特殊系统概念，不适用于其他航司）
		IS LOCATION EQUAL BASE A: Y/N,任务环基地和组员基地是否相同（注：该设置适用于半环，或多基地调动）. 
		     Y-任务环基地和组员基地相同；N-任务环基地和组员不同
		*B参数：定义和上面类似，属于下一个ROSTER的过滤条件
		当连续两个ROSTER，A和B符合上述筛选条件，并且执行组员也是符合人员过滤条件，检查两个ROSTER之间间隔
		SPACE: 两个ROSTER之间间隔数量
		UNIT：两个ROSTER之间间隔数量的时间单位，支持RH（小时）、CD（日历日）两种时间单位
		DIRECTIONAL:Y/N，Y-检查A-B之间的间隔，N-检查A-B和B-A之间间隔
		UTILIZE POST DUTY REST: Y/N,任务环的航后休息，是否计算到间隔中。
		支持通配符*的参数：
			BASES/RANKS/FLEETS
			IS LOCATION EQUAL BASE A/B
			QUALIFIER A/B
			ATTRIBUTE A/B
			LABEL A/B
			ASSIGNMENT GROUP A/B
*/
bool LegalityChecker::checkRosterSpaceByLableAndAtt(SharedPtr<CREW> crew, Pairing* pairing, const DBRule* singleRule, bool isDebug)
{
	bool isValid = true;
	const auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;
	string header, headeValue;

	bool bDirectional = false, bUtilizePostRest = false;

	rule8056* ruleParam = (rule8056*)singleRule->parsedParam.get();
	const string& strBase = ruleParam->strBase;
	const string& strRank = ruleParam->strRank;
	const string& strFleet = ruleParam->strFleet;
	const string& strAttributeA = ruleParam->strAttributeA;
	const string& strAttributeB = ruleParam->strAttributeB;
	const string& strLabelA = ruleParam->strLabelA;
	const string& strLabelB = ruleParam->strLabelB;
	const string& strAssignmentA = ruleParam->strAssignmentA;
	const string& strAssignmentB = ruleParam->strAssignmentB;
	const string& strQualifierA = ruleParam->strQualifierA;
	const string& strQualifierB = ruleParam->strQualifierB;
	const string& strAEqualToBase = ruleParam->strAEqualToBase;
	const string& strBEqualToBase = ruleParam->strBEqualToBase;
	const string& strAirportsA = ruleParam->strAirportsA;
	const string& strAirportsB = ruleParam->strAirportsB;
	const string& strIsReqA = ruleParam->strIsReqA;
	const string& strIsReqB = ruleParam->strIsReqB;
	const string& strIsLineTrainingA = ruleParam->strIsLineTrainingA;
	const string& strIsLineTrainingB = ruleParam->strIsLineTrainingB;
	const string& strSpace = ruleParam->strSpace;
	const string& strUnit = ruleParam->strUnit;
	const string& strDirectional = ruleParam->strDirectional;
	const string& strUtilizePostRest = ruleParam->strUtilizePostRest;
	const string& strTeam = ruleParam->strTeam;

	if (strDirectional == "Y")
		bDirectional = true;
	if (strUtilizePostRest == "Y")
		bUtilizePostRest = true;

	string strTemp1, strTemp2, strTemp3, strTemp4, strTemp5;
	int iCurrentRoster = -1;

	vector<SharedPtr<ROSTER>> rosters = PhaseUtils::Filter(crew->rosterList, singleRule->phase, this->_dbData);

	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, strFleet, strTeam, "*", pairing->getStartTimeUtc(), pairing->getEndTimeUtc()))
		return true;
	time_t lStaDT = 0, lEndDT = 0;
	double lSpace = 0;
	int offsetMinutes = 0;

	if (strUnit == "CD")
		lSpace = stod(strSpace.c_str()) * 24 * 3600;
	else if (strUnit == "LN")
		lSpace = atoi(strSpace.c_str()); //间隔中跨过的当地夜晚数量 Rule2014法规 定义本地夜晚
	else
		lSpace = stod(strSpace.c_str()) * 3600;

	vector<SharedPtr<CREW_BASE>>& bases = crew->baseList;
	string base = Utility::GetInstancePtr()->getCrewPrimaryBase(bases, pairing->getStartTimeUtc());

	roster_space * tempA;
	roster_space * tempB;
	roster_space temp;
	stringstream keySS;
	keySS << singleRule->idRule << "|" << singleRule->tableNum << "|" << singleRule->rowNum;
	string key = keySS.str();
	if (g_rule8056_cache.find(key) != g_rule8056_cache.end()) {
		tempA = g_rule8056_cache[key].first.get();
		tempB = g_rule8056_cache[key].second.get();
	}
	else {
		///TEST
		cout << "8056 new item: " << key << "  g_rule8056_cache.size=" << g_rule8056_cache.size() << endl;

		g_rule8056_cache[key] = make_pair(shared_ptr<roster_space>(new roster_space), shared_ptr<roster_space>(new roster_space));
		tempA = g_rule8056_cache[key].first.get();
		tempB = g_rule8056_cache[key].second.get();
		split(strAttributeA, '|', tempA->attributes);
		split(strAssignmentA, '|', tempA->assignments);
		split(strLabelA, '|', tempA->labels);
		split(strQualifierA, '|', tempA->qualifiers);
		split(strAirportsA, '|', tempA->airports);

		tempA->strAirports = strAirportsA;
		tempA->isRequested = strIsReqA;
		tempA->isLineTraining = strIsLineTrainingA;
		tempA->strLocationSameTOBase = strAEqualToBase;
		tempA->crewBase = base;

		split(strAttributeB, '|', tempB->attributes);
		split(strAssignmentB, '|', tempB->assignments);
		split(strLabelB, '|', tempB->labels);
		split(strQualifierB, '|', tempB->qualifiers);
		split(strAirportsB, '|', tempB->airports);

		tempB->strAirports = strAirportsB;
		tempB->isRequested = strIsReqB;
		tempB->isLineTraining = strIsLineTrainingB;
		tempB->strLocationSameTOBase = strBEqualToBase;
		tempB->crewBase = base;

	}

	bool isMatchA = Utility::GetInstancePtr()->isMatchRosterSpace(pairing, tempA);
	bool isMatchB = Utility::GetInstancePtr()->isMatchRosterSpace(pairing, tempB);

	if (!isMatchA && !isMatchB)
		return true;
	offsetMinutes = this->_dbData->getAirportOffsetMinutes(pairing->getBase());
	//vector<int> rosterA, rosterB;

	int pairingRosterIndex = -1;//当前Paring对应的rosters的索引
	for (size_t i = 0; i < rosters.size(); i++) {
		if (rosters[i]->pairId == pairing->getDbId()) {
			pairingRosterIndex = i;
			break;
		}
	}

	if (isMatchA)
	{
		vector<int> rosterB;
		iCurrentRoster = Utility::GetInstancePtr()->getFirstRoster(rosters, tempB, this->_dbData);
		while (iCurrentRoster != FAILURE)
		{
			rosterB.push_back(iCurrentRoster);
			iCurrentRoster = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, tempB, this->_dbData);
		}
		int tmpCurrentRosterIndex = 0, tmpNextRosterIndex = 0;
		for (std::size_t a = 0; a < rosterB.size(); ++a)
		{
			if (bDirectional && rosters[rosterB[a]]->actStrUtc < pairing->getStartTimeUtc())
				continue;

			if (bUtilizePostRest)
			{
				if (bDirectional || rosters[rosterB[a]]->actStrUtc > pairing->getStartTimeUtc())
				{
					lStaDT = pairing->getEndTimeUtc();
					lEndDT = rosters[rosterB[a]]->actStrUtc;

					tmpCurrentRosterIndex = pairingRosterIndex;
					tmpNextRosterIndex = rosterB[a];
				}
				else
				{
					lStaDT = rosters[rosterB[a]]->actRestStrUtc;
					lEndDT = pairing->getStartTimeUtc();

					tmpCurrentRosterIndex = rosterB[a];
					tmpNextRosterIndex = pairingRosterIndex;
				}
			}
			else
			{
				if (bDirectional || rosters[rosterB[a]]->actStrUtc > pairing->getStartTimeUtc())
				{
					lStaDT = pairing->getEndTimeIncludingRestUtcAct();
					lEndDT = rosters[rosterB[a]]->actStrUtc;

					tmpCurrentRosterIndex = pairingRosterIndex;
					tmpNextRosterIndex = rosterB[a];
				}
				else
				{
					lStaDT = rosters[rosterB[a]]->actEndUtc;
					lEndDT = pairing->getStartTimeUtc();

					tmpCurrentRosterIndex = rosterB[a];
					tmpNextRosterIndex = pairingRosterIndex;
				}
			}

			if (strUnit == "CD")
			{
				lEndDT = Utility::GetInstancePtr()->getLocalDayStartInUTC(lEndDT, offsetMinutes) + 24 * 3600;
				lStaDT = Utility::GetInstancePtr()->getLocalDayStartInUTC(lStaDT, offsetMinutes);
			}
			else if (strUnit == "LN") {
				if (pairingRosterIndex < 0) {
					continue;
				}
				int maxLocalNightNum = 0;
				time_t restStartTimeUtc = rosters[tmpCurrentRosterIndex]->actRestStrUtc;
				time_t restEndTimeUtc = rosters[tmpNextRosterIndex]->actStrUtc;
				for (int i = tmpCurrentRosterIndex + 1; i <= tmpNextRosterIndex; i++) {
					restEndTimeUtc = rosters[i]->actStrUtc;
					if (RuleParams::GetInstancePtr()->isRestAssignment(rosters[i]->qualifier, rosters[i]->duty)) {
						restEndTimeUtc = rosters[i]->actRestStrUtc;
					}
					else {
						int localNightNum = DutyUtils::GetLocalNightNums(restStartTimeUtc, restEndTimeUtc, offsetMinutes);
						if (localNightNum > maxLocalNightNum) {
							maxLocalNightNum = localNightNum;
						}
						restStartTimeUtc = rosters[i]->actRestStrUtc;
					}
				}
				int localNightNum = DutyUtils::GetLocalNightNums(restStartTimeUtc, restEndTimeUtc, offsetMinutes);
				if (localNightNum > maxLocalNightNum) {
					maxLocalNightNum = localNightNum;
				}

				if (maxLocalNightNum < (int)lSpace) {
					if (isDebug)
					{
						cout << "The space(Attribute=" << strAttributeA << "-" << strAttributeB;
						cout << ",Roster Duty=" << strAssignmentA << "-" << strAssignmentB;
						cout << ",Pairing Label=" << strLabelA << "-" << strLabelB;
						cout << ",Qualifier=" << strQualifierA << "-" << strQualifierB;
						cout << ") between roster[" << rosters[rosterB[a]]->rosterId << "]";
						cout << " and Pairing[" << pairing->getDbId();
						cout << "] is less than " << strSpace << " " << strUnit << ".\n";
						//printf(errMsg.str().c_str());
					}
					return false;
				}
				continue;
			}

			if (abs(lStaDT - lEndDT) < lSpace)
			{
				if (isDebug)
				{
					cout << "The space(Attribute=" << strAttributeA << "-" << strAttributeB;
					cout << ",Roster Duty=" << strAssignmentA << "-" << strAssignmentB;
					cout << ",Pairing Label=" << strLabelA << "-" << strLabelB;
					cout << ",Qualifier=" << strQualifierA << "-" << strQualifierB;
					cout << ") between roster[" << rosters[rosterB[a]]->rosterId << "]";
					cout << " and Pairing[" << pairing->getDbId();
					cout << "] is less than " << strSpace << " " << strUnit << ".\n";
					//printf(errMsg.str().c_str());
				}
				return false;
			}
		}
	}

	if (isMatchB)
	{
		vector<int> rosterA;
		iCurrentRoster = Utility::GetInstancePtr()->getFirstRoster(rosters, tempA, this->_dbData);
		while (iCurrentRoster != FAILURE)
		{
			rosterA.push_back(iCurrentRoster);
			iCurrentRoster = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, tempA, this->_dbData);
		}
		int tmpCurrentRosterIndex = 0, tmpNextRosterIndex = 0;
		for (std::size_t a = 0; a < rosterA.size(); ++a)
		{
			if (bDirectional && rosters[rosterA[a]]->actStrUtc < pairing->getStartTimeUtc())
				continue;

			if (bUtilizePostRest)
			{
				if (bDirectional || rosters[rosterA[a]]->actStrUtc > pairing->getStartTimeUtc())
				{
					lStaDT = pairing->getEndTimeUtc();
					lEndDT = rosters[rosterA[a]]->actStrUtc;

					tmpCurrentRosterIndex = pairingRosterIndex;
					tmpNextRosterIndex = rosterA[a];
				}
				else
				{
					lStaDT = rosters[rosterA[a]]->actRestStrUtc;
					lEndDT = pairing->getStartTimeUtc();

					tmpCurrentRosterIndex = rosterA[a];
					tmpNextRosterIndex = pairingRosterIndex;
				}
			}
			else
			{
				if (bDirectional || rosters[rosterA[a]]->actStrUtc > pairing->getStartTimeUtc())
				{
					lStaDT = pairing->getEndTimeIncludingRestUtcAct();
					lEndDT = rosters[rosterA[a]]->actStrUtc;

					tmpCurrentRosterIndex = pairingRosterIndex;
					tmpNextRosterIndex = rosterA[a];
				}
				else
				{
					lStaDT = rosters[rosterA[a]]->actEndUtc;
					lEndDT = pairing->getStartTimeUtc();

					tmpCurrentRosterIndex = rosterA[a];
					tmpNextRosterIndex = pairingRosterIndex;
				}
			}

			if (strUnit == "CD")
			{
				lEndDT = Utility::GetInstancePtr()->getLocalDayStartInUTC(lEndDT, offsetMinutes) + 24 * 3600;
				lStaDT = Utility::GetInstancePtr()->getLocalDayStartInUTC(lStaDT, offsetMinutes);
			}
			else if (strUnit == "LN") {
				if (pairingRosterIndex < 0) {
					continue;
				}
				int maxLocalNightNum = 0;
				time_t restStartTimeUtc = rosters[tmpCurrentRosterIndex]->actRestStrUtc;
				time_t restEndTimeUtc = rosters[tmpNextRosterIndex]->actStrUtc;
				for (int i = tmpCurrentRosterIndex + 1; i <= tmpNextRosterIndex; i++) {
					restEndTimeUtc = rosters[i]->actStrUtc;
					if (RuleParams::GetInstancePtr()->isRestAssignment(rosters[i]->qualifier, rosters[i]->duty)) {
						restEndTimeUtc = rosters[i]->actRestStrUtc;
					}
					else {
						int localNightNum = DutyUtils::GetLocalNightNums(restStartTimeUtc, restEndTimeUtc, offsetMinutes);
						if (localNightNum > maxLocalNightNum) {
							maxLocalNightNum = localNightNum;
						}
						restStartTimeUtc = rosters[i]->actRestStrUtc;
					}
				}
				int localNightNum = DutyUtils::GetLocalNightNums(restStartTimeUtc, restEndTimeUtc, offsetMinutes);
				if (localNightNum > maxLocalNightNum) {
					maxLocalNightNum = localNightNum;
				}

				if (maxLocalNightNum < (int)lSpace) {
					if (isDebug)
					{
						cout << "The space(Attribute=" << strAttributeA << "-" << strAttributeB;
						cout << ",Roster Duty=" << strAssignmentA << "-" << strAssignmentB;
						cout << ",Pairing Label=" << strLabelA << "-" << strLabelB;
						cout << ",Qualifier=" << strQualifierA << "-" << strQualifierB;
						cout << ") between roster[" << rosters[rosterA[a]]->rosterId << "]";
						cout << " and Pairing[" << pairing->getDbId();
						cout << "] is less than " << strSpace << " " << strUnit << ".\n";
						//printf(errMsg.str().c_str());
					}
					return false;
				}
				continue;
			}

			if (abs(lStaDT - lEndDT) < lSpace)
			{
				if (isDebug)
				{
					cout << "The space(Attribute=" << strAttributeA << "-" << strAttributeB;
					cout << ",Roster Duty=" << strAssignmentA << "-" << strAssignmentB;
					cout << ",Pairing Label=" << strLabelA << "-" << strLabelB;
					cout << ",Qualifier=" << strQualifierA << "-" << strQualifierB;
					cout << ") between roster[" << rosters[rosterA[a]]->rosterId << "]";
					cout << " and Pairing[" << pairing->getDbId();
					cout << "] is less than " << strSpace << " " << strUnit << ".\n";
					//printf(errorMsg.c_str());
				}
				return false;
			}
		}
	}
	return true;
}

//8056
bool LegalityChecker::checkRosterSpaceByLableAndAtt(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool isValid = true;

	/*
	auto& parameter = singleRule->params;
	map<string, string>::const_iterator iter;
	string header, headeValue;
	string strAttributeA = "*", strAttributeB = "*", strSpace;
	string strLabelA = "*", strLabelB = "*", strAssignmentA = "*", strAssignmentB = "*", strUnit, strAEqualToBaseA = "*", strBEqualToBaseB = "*";
	string strQualifierA = "*", strQualifierB = "*", strRolesA = "*", strRolesB = "*";
	bool bDirectional = false, bUtilizePostRest = false;
	string strIsReqA, strIsReqB;
	string strAirportsB = "*", strAirportsA = "*";
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;

		if (header == "ATTRIBUTE A") {
			strAttributeA = headeValue;
		}
		if (header == "LABEL A") {
			strLabelA = headeValue;
		}
		if (header == "ASSIGNMENT GROUP A") {
			strAssignmentA = headeValue;
		}
		if (header == "IS REQUESTED A") {
			strIsReqA = headeValue;
		}
		if (header == "QUALIFIER A") {
			strQualifierA = headeValue;
		}
		if (header == "AIRPORT A") {
			strAirportsA = headeValue;
		}
		if (header == "IS REQUESTED B") {
			strIsReqB = headeValue;
		}
		if (header == "ATTRIBUTE B") {
			strAttributeB = headeValue;
		}
		if (header == "LABEL B") {
			strLabelB = headeValue;
		}
		if (header == "ASSIGNMENT GROUP B") {
			strAssignmentB = headeValue;
		}
		if (header == "QUALIFIER B") {
			strQualifierB = headeValue;
		}
		if (header == "AIRPORT B") {
			strAirportsB = headeValue;
		}
		if (header == "SPACE") {
			strSpace = headeValue;
		}
		if (header == "UNIT") {
			strUnit = headeValue;
		}
		if (header == "ROLES A") {
			strRolesA = headeValue;
		}
		if (header == "ROLES B") {
			strRolesB = headeValue;
		}
		if (header == "DIRECTIONAL")
			bDirectional = (headeValue == "Y");
		if (header == "IS LOCATION EQUAL BASE A")
			strAEqualToBaseA = headeValue;
		if (header == "IS LOCATION EQUAL BASE B")
			strBEqualToBaseB = headeValue;
		if (header == "UTILIZE POST DUTY REST")
			bUtilizePostRest = (headeValue == "Y");
	}*/
	
	rule8056* ruleParam = (rule8056*)singleRule->parsedParam.get();
	const string& strBase = ruleParam->strBase;
	const string& strRank = ruleParam->strRank;
	const string& strFleet = ruleParam->strFleet;
	const string& strAttributeA = ruleParam->strAttributeA;
	const string& strAttributeB = ruleParam->strAttributeB;
	const string& strLabelA = ruleParam->strLabelA;
	const string& strLabelB = ruleParam->strLabelB;
	const string& strAssignmentA = ruleParam->strAssignmentA;
	const string& strAssignmentB = ruleParam->strAssignmentB;
	const string& strQualifierA = ruleParam->strQualifierA;
	const string& strQualifierB = ruleParam->strQualifierB;
	const string& strAEqualToBaseA = ruleParam->strAEqualToBase;
	const string& strBEqualToBaseB = ruleParam->strBEqualToBase;
	const string& strAirportsA = ruleParam->strAirportsA;
	const string& strAirportsB = ruleParam->strAirportsB;
	const string& strIsReqA = ruleParam->strIsReqA;
	const string& strIsReqB = ruleParam->strIsReqB;
	const string& strIsLineTrainingA = ruleParam->strIsLineTrainingA;
	const string& strIsLineTrainingB = ruleParam->strIsLineTrainingB;
    const vector<string>& courseCodesA = ruleParam->courseCodesA;
	const vector<string>& courseCodesB = ruleParam->courseCodesB;
	const string& strSpace = ruleParam->strSpace;
	const string& strUnit = ruleParam->strUnit;
	const string& strDirectional = ruleParam->strDirectional;
	const string& strUtilizePostRest = ruleParam->strUtilizePostRest;

	const bool bDirectional = (strDirectional == "Y");
	const bool bUtilizePostRest = (strUtilizePostRest == "Y");

	const string& strRolesA = ruleParam->strRolesA;
	const string& strRolesB = ruleParam->strRolesB;
	const string& strTeam = ruleParam->strTeam;


	string strTemp1, strTemp2, strTemp3, strTemp4, strTemp5;
	int iCurrentRoster = -1;

	SharedPtr<CREW> crew = _dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>> rosters = PhaseUtils::Filter(crew->rosterList, singleRule->phase, this->_dbData);
	vector<SharedPtr<CREW_BASE>>& bases = crew->baseList;
	if (rosters.size() == 0)
		return true;

	const string& crewid = crew->idCrew;
	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->actRestStrUtc;
	}

	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, strFleet, strTeam, "*", lCheckedStart, lCheckedEnd))
		return true;

	const string& base = Utility::GetInstancePtr()->getCrewPrimaryBase(bases, lCheckedStart);
	//if (this->GetApplication() == ROSTER_OPTIMIZER)
	//	if (!rosters[pCrew->RosterIndex]->pairing)
	//		return true;

	time_t lStaDT = 0, lEndDT = 0;
	double lSpace = 0.0;
	int iNextRoster = 0;
	int offsetMinutes = 0;

	if (strUnit == "CD")
		lSpace = atof(strSpace.c_str()) * 24 * 3600;
	else if (strUnit == "LN")
		lSpace = atoi(strSpace.c_str()); //间隔中跨过的当地夜晚数量 Rule2014法规 定义本地夜晚
	else
		lSpace = atof(strSpace.c_str()) * 3600;

	roster_space * tempA;
	roster_space * tempB;
	roster_space temp;
	stringstream keySS;
	keySS << singleRule->idRule << "|" << singleRule->tableNum << "|" << singleRule->rowNum;
	string key = keySS.str();
	if (g_rule8056_cache.find(key) != g_rule8056_cache.end())
	{
		tempA = g_rule8056_cache[key].first.get();
		tempB = g_rule8056_cache[key].second.get();
		tempA->crewBase = base;
		tempB->crewBase = base;
	}
	else
	{
		g_rule8056_cache[key] = make_pair(shared_ptr<roster_space>(new roster_space), shared_ptr<roster_space>(new roster_space));
		tempA = g_rule8056_cache[key].first.get();
		tempB = g_rule8056_cache[key].second.get();

		split(strAttributeA, '|', tempA->attributes);
		split(strAssignmentA, '|', tempA->assignments);
		split(strLabelA, '|', tempA->labels);
		split(strQualifierA, '|', tempA->qualifiers);
		split(strRolesA, '|', tempA->roles);
		split(strAirportsA, '|', tempA->airports);
		tempA->strAirports = strAirportsA;
		tempA->isRequested = strIsReqA;
		tempA->isLineTraining = strIsLineTrainingA;
		tempA->courseCodes = courseCodesA;
		tempA->strLocationSameTOBase = strAEqualToBaseA;
		tempA->crewBase = base;

		split(strAttributeB, '|', tempB->attributes);
		split(strAssignmentB, '|', tempB->assignments);
		split(strLabelB, '|', tempB->labels);
		split(strQualifierB, '|', tempB->qualifiers);
		split(strRolesB, '|', tempB->roles);
		split(strAirportsB, '|', tempB->airports);
		tempB->strAirports = strAirportsB;
		tempB->isRequested = strIsReqB;
		tempB->isLineTraining = strIsLineTrainingB;
		tempB->courseCodes = courseCodesB;
		tempB->strLocationSameTOBase = strBEqualToBaseB;
		tempB->crewBase = base;

	}

	//if ((crew->idCrew == "PR422023CP" ) && (strUnit == "RH" ) && (strSpace == "4"))
	//	printf("");

	vector<int> rosterA, rosterB;
	rosterA = Utility::GetInstancePtr()->getMatchedRosters(rosters, tempA, this->_dbData);
	rosterB = Utility::GetInstancePtr()->getMatchedRosters(rosters, tempB, this->_dbData);

	/*2023/05/06 用getMatchedRosters代替getFirstRoster和getNextRoster
	iCurrentRoster = Utility::GetInstancePtr()->getFirstRoster(rosters, tempA, this->_dbData);

	while (iCurrentRoster != FAILURE)
	{
		rosterA.push_back(iCurrentRoster);
		iCurrentRoster = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, tempA, this->_dbData);
	}

	iCurrentRoster = Utility::GetInstancePtr()->getFirstRoster(rosters, tempB, this->_dbData);
	while (iCurrentRoster != FAILURE)
	{
		rosterB.push_back(iCurrentRoster);
		iCurrentRoster = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, tempB, this->_dbData);
	}
	*/

	time_t start, end;
	for (std::size_t a = 0; a < rosterA.size(); ++a)
	{
		if (rosterB.size() == 0)
			return true;
		//this->_dbData->isAssignmentInGroup(assignment, "GND"
		//if ((rosters[rosterA[a]]->rosterId == 27825900 || rosters[rosterA[a]]->rosterId == 27825901)
		//	&& (crew->idCrew == "7574"))
		//	printf("");

		for (std::size_t b = 0; b < rosterB.size(); ++b)
		{
			if ((bDirectional && rosterA[a] >= rosterB[b]) || rosterB[b] == rosterA[a])
				continue;

			if (this->GetApplication() == ROSTER_OPTIMIZER)
			{
				if ((pCrew->RosterIndex != rosterA[a]) && (pCrew->RosterIndex != rosterB[b]))
					continue;
			}

			//check the space of two attributes
			iCurrentRoster = min(rosterA[a], rosterB[b]);
			iNextRoster = max(rosterA[a], rosterB[b]);
			
			if (rosters[iCurrentRoster]->isMergeDpWithNext && rosters[iNextRoster]->isMergeDpWithBefore 
				&& rosters[iCurrentRoster]->mergeDpNextRosterId == rosters[iNextRoster]->rosterId) {
				//DP合并后不检查两条记录之间的间隔
				continue;
			}

			//if (crew->idCrew == "F02235" && rosters[iCurrentRoster]->rosterId == 380327)
			//	printf("");

			if (RosterUtils::ExistExceptionCode(rosters[iCurrentRoster].get(), rosters[iCurrentRoster]->pairing, singleRule->exceptionCodes, _dbData)) {
				continue;
			}

			if (bUtilizePostRest)
				lEndDT = rosters[iCurrentRoster]->actRestStrUtc;
			else
			{
				lEndDT = rosters[iCurrentRoster]->actEndUtc;
				if (rosters[iCurrentRoster]->pairing)
					lEndDT = rosters[iCurrentRoster]->pairing->getEndTimeIncludingRestUtcAct();
			}
			lStaDT = rosters[iNextRoster]->actStrUtc;
			start = lEndDT;
			end = lStaDT;

			//20181228 ain, mantis#3680, 8056 unit=CD时时区按crewBase
			offsetMinutes = strUnit == "CD"
				? this->_dbData->getAirportOffsetMinutes(tempB->crewBase)
				: this->_dbData->getAirportOffsetMinutes(rosters[iCurrentRoster]->location);
			if (strUnit == "CD")
			{
				lEndDT = Utility::GetInstancePtr()->getLocalDayStartInUTC(lEndDT, offsetMinutes) + 24 * 3600;
				lStaDT = Utility::GetInstancePtr()->getLocalDayStartInUTC(lStaDT, offsetMinutes);
			}
			else if (strUnit == "LN") {
				int maxLocalNightNum = 0;
				time_t restStartTimeUtc = rosters[iCurrentRoster]->actRestStrUtc;
				time_t restEndTimeUtc = rosters[iNextRoster]->actStrUtc;
				for (int i = iCurrentRoster + 1; i <= iNextRoster; i++) {
					restEndTimeUtc = rosters[i]->actStrUtc;
					if (RuleParams::GetInstancePtr()->isRestAssignment(rosters[i]->qualifier, rosters[i]->duty)) {
						restEndTimeUtc = rosters[i]->actRestStrUtc;
					}
					else {
						int localNightNum = DutyUtils::GetLocalNightNums(restStartTimeUtc, restEndTimeUtc, offsetMinutes);
						if (localNightNum > maxLocalNightNum) {
							maxLocalNightNum = localNightNum;
						}
						restStartTimeUtc = rosters[i]->actRestStrUtc;
					}
				}

				int localNightNum = DutyUtils::GetLocalNightNums(restStartTimeUtc, restEndTimeUtc, offsetMinutes);
				if (localNightNum > maxLocalNightNum) {
					maxLocalNightNum = localNightNum;
				}

				if (maxLocalNightNum < (int)lSpace) {
					if ((this->GetApplication() != ROSTER_OPTIMIZER) ||
						(this->GetApplication() == ROSTER_OPTIMIZER && (pCrew->RosterIndex == iCurrentRoster || pCrew->RosterIndex == iNextRoster))
						|| (this->GetApplication() == ROSTER_OPTIMIZER && (rosters[iCurrentRoster]->source != "PA" || rosters[iNextRoster]->source != "PA")))
					{
						pCrew->isLegal = false;
						pCrew->skipCheckInLaterIterations = true;
						if (this->GetApplication() == ROSTER_OPTIMIZER) {
							return false;
						}
						isValid = false;

						string strActualSpace = std::to_string(localNightNum);
	
						string currRosterLabel = rosters[iCurrentRoster]->label.empty() ? rosters[iCurrentRoster]->qualifier : rosters[iCurrentRoster]->label;
						string nextRosterLabel = rosters[iNextRoster]->label.empty() ? rosters[iNextRoster]->qualifier : rosters[iNextRoster]->label;
						string errorMsg = "The spacing between (" + currRosterLabel + ") and (" + nextRosterLabel + ") is " + strActualSpace
								+ " , which is less than " + strSpace + " " + strUnit + ".";

						setLegalityMessage(rosters[iCurrentRoster], pCrew, singleRule, errorMsg);
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
						rv->pairingId = rosters[iCurrentRoster]->pairId;
						rv->rosterId = rosters[iCurrentRoster]->rosterId;
						rv->startDTUtc = start;
						rv->endDTUtc = end;
						rv->violation_msg = errorMsg;
						rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
						//OP#1448提供message参数给gantt
						// 目前Java RuleCombination 8056法規只用到iCurrentRosterLabel, iNextRosterLabel, strSpace, strUnit 4項
						//rv->operation_result.insert(pair<string, string>("strAttributeA", strAttributeA));
						//rv->operation_result.insert(pair<string, string>("strAttributeB", strAttributeB));
						//rv->operation_result.insert(pair<string, string>("strLabelA", strLabelA));
						//rv->operation_result.insert(pair<string, string>("strLabelB", strLabelB));
						rv->operation_result.insert(pair<string, string>("strActualSpace", strActualSpace));
						rv->operation_result.insert(pair<string, string>("strSpace", strSpace));
						rv->operation_result.insert(pair<string, string>("strUnit", strUnit));
						rv->operation_result.insert(pair<string, string>("iCurrentRosterLabel", currRosterLabel));
						rv->operation_result.insert(pair<string, string>("iNextRosterLabel", nextRosterLabel));
						rv->operation_result.insert(pair<string, string>("ruleId", "8056.02"));
						//rv->operation_result.insert(pair<string, string>("iCurrentRosterID", Utility::GetInstancePtr()->llToa(rosters[iCurrentRoster]->rosterId)));
						//rv->operation_result.insert(pair<string, string>("iNextRosterID", Utility::GetInstancePtr()->llToa(rosters[iNextRoster]->rosterId)));
						this->addRuleViolations(rv, singleRule);
					}
				}
				continue;
			}
			long interval = static_cast<long>(lStaDT - lEndDT);
			//if (interval < 0)interval *= -1;
			if (interval < lSpace)
			{
				if (isCallinStandby(rosters[iCurrentRoster], rosters[iNextRoster]) && iCurrentRoster == iNextRoster - 1)
					continue;
				
				if (rosters[iCurrentRoster]->isMergeDpWithNext && rosters[iNextRoster]->isMergeDpWithBefore
					&& rosters[iCurrentRoster]->mergeDpNextRosterId == rosters[iNextRoster]->rosterId) {
					//DP合并后不检查两条记录之间的间隔
					continue;
				}

				if ((this->GetApplication() != ROSTER_OPTIMIZER) ||
					(this->GetApplication() == ROSTER_OPTIMIZER && (pCrew->RosterIndex == iCurrentRoster || pCrew->RosterIndex == iNextRoster))
					|| (this->GetApplication() == ROSTER_OPTIMIZER && (rosters[iCurrentRoster]->source!="PA" || rosters[iNextRoster]->source != "PA")))
				{
					pCrew->isLegal = false;
					pCrew->skipCheckInLaterIterations = true;
					if (this->GetApplication() == ROSTER_OPTIMIZER) {
						return false;
					}
					isValid = false;
					// mantis#4856 - 法規彈出文字和Alert Center一致
					/*string errorMsg = "The space(Attribute=" + strAttributeA + "-" + strAttributeB;
					errorMsg += ",Roster Duty=" + strAssignmentA + "-" + strAssignmentB;
					errorMsg += ",Pairing Label=" + strLabelA + "-" + strLabelB;
					errorMsg += ",Qualifier=" + strQualifierA + "-" + strQualifierB;
					errorMsg += ",Role=" + strRolesA + "-" + strRolesB;
					errorMsg += ") between rosters[" + boost::lexical_cast<string>(rosters[iCurrentRoster]->rosterId);
					errorMsg += "," + boost::lexical_cast<string>(rosters[iNextRoster]->rosterId);
					errorMsg += "] is less than " + strSpace + " " + strUnit + ".";*/
					string strActualSpace;
					if (strUnit == "CD")
					{
						strActualSpace = std::to_string((interval) / (24 * 3600)) + " CD";
					}
					else
					{
						strActualSpace =  Utility::GetInstancePtr()->formatMinutes((interval < 0 ? interval * -1 : interval) / 60);
					}
					string currRosterLabel = rosters[iCurrentRoster]->label.empty() ? rosters[iCurrentRoster]->qualifier : rosters[iCurrentRoster]->label;
					string nextRosterLabel = rosters[iNextRoster]->label.empty() ? rosters[iNextRoster]->qualifier : rosters[iNextRoster]->label;
					string errorMsg = "The spacing between (" + currRosterLabel;
					errorMsg += ") and (" + nextRosterLabel + ") is " + (interval < 0 ? ("-" + strActualSpace) : strActualSpace);
					errorMsg += ", which is less than " + strSpace + " " + strUnit + ".";
					setLegalityMessage(rosters[iCurrentRoster], pCrew, singleRule, errorMsg);
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
					rv->pairingId = rosters[iCurrentRoster]->pairId;
					rv->rosterId = rosters[iCurrentRoster]->rosterId;
					rv->startDTUtc = start;
					rv->endDTUtc = end;
					rv->violation_msg = errorMsg;
					rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
					//OP#1448提供message参数给gantt
					// 目前Java RuleCombination 8056法規只用到iCurrentRosterLabel, iNextRosterLabel, strSpace, strUnit 4項
					//rv->operation_result.insert(pair<string, string>("strAttributeA", strAttributeA));
					//rv->operation_result.insert(pair<string, string>("strAttributeB", strAttributeB));
					//rv->operation_result.insert(pair<string, string>("strLabelA", strLabelA));
					//rv->operation_result.insert(pair<string, string>("strLabelB", strLabelB));
					rv->operation_result.insert(pair<string, string>("strActualSpace", (interval < 0 ? ("-" + strActualSpace) : strActualSpace)));
					rv->operation_result.insert(pair<string, string>("strSpace", strSpace));
					rv->operation_result.insert(pair<string, string>("strUnit", strUnit));
					rv->operation_result.insert(pair<string, string>("iCurrentRosterLabel", currRosterLabel));
					rv->operation_result.insert(pair<string, string>("iNextRosterLabel", nextRosterLabel));
					rv->operation_result.insert(pair<string, string>("ruleId", "8056.01"));
					//rv->operation_result.insert(pair<string, string>("iCurrentRosterID", Utility::GetInstancePtr()->llToa(rosters[iCurrentRoster]->rosterId)));
					//rv->operation_result.insert(pair<string, string>("iNextRosterID", Utility::GetInstancePtr()->llToa(rosters[iNextRoster]->rosterId)));
					this->addRuleViolations(rv, singleRule);
				}
			}

		}
	}

	/*
	strTemp1 = strAttributeA, strTemp2 = strAssignmentA, strTemp3 = strLabelA, strTemp4 = strIsReqA, strTemp5 = strAEqualToBase;
	temp = tempA;
	if (!bDirectional)
	{
	//iCurrentRoster = Utility::GetInstancePtr()->getFirstRoster(rosters, strAttributeA, strAssignmentA, strLabelA, strIsReqA, base, strAEqualToBase);
	iCurrentRoster = Utility::GetInstancePtr()->getFirstRoster(rosters, &tempA);
	//int iTemp = Utility::GetInstancePtr()->getFirstRoster(rosters, strAttributeB, strAssignmentB, strLabelB, strIsReqB, base, strBEqualToBase);
	int iTemp = Utility::GetInstancePtr()->getFirstRoster(rosters, &tempB);
	if (iTemp < iCurrentRoster)
	{
	iCurrentRoster = iTemp;
	strTemp1 = strAttributeB, strTemp2 = strAssignmentB, strTemp3 = strLabelB, strTemp4 = strIsReqB, strTemp5 = strBEqualToBase;
	//iNextRoster = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, strAttributeA, strAssignmentA, strLabelA, strIsReqA, base, strAEqualToBase);
	temp = tempB;
	iNextRoster = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, &tempA);
	}
	else
	//iNextRoster = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, strAttributeB, strAssignmentB, strLabelB, strIsReqB, base, strBEqualToBase);
	iNextRoster = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, &tempB);
	}
	else
	{
	//iCurrentRoster = Utility::GetInstancePtr()->getFirstRoster(rosters, strAttributeA, strAssignmentA, strLabelA, strIsReqA, base, strAEqualToBase);
	iCurrentRoster = Utility::GetInstancePtr()->getFirstRoster(rosters, &tempA);

	//iNextRoster = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, strAttributeB, strAssignmentB, strLabelB, strIsReqB, base, strBEqualToBase);
	iNextRoster = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, &tempB);
	}

	//printf("checkRosterSpaceByLableAndAtt-2:%s\n", crewid.c_str());


	while ((iCurrentRoster != FAILURE) && (iNextRoster != FAILURE))
	{
	//check the space of two attributes

	if (bUtilizePostRest)
	lEndDT = rosters[iCurrentRoster]->actRestStrUtc;
	else
	lEndDT = rosters[iCurrentRoster]->actEndUtc;

	lStaDT = rosters[iNextRoster]->actStrUtc;
	offset = this->_dbData->getAirportOffset(rosters[iCurrentRoster]->location);
	if (strUnit == "CD")
	{
	lEndDT = Utility::GetInstancePtr()->getLocalDayStartInUTC(lEndDT, offset) + 24 * 3600;
	lStaDT = Utility::GetInstancePtr()->getLocalDayStartInUTC(lStaDT, offset);
	}

	if (lStaDT<lEndDT + lSpace)
	{
	//if ((this->GetApplication() == ROSTER_OPTIMIZER) && (pCrew->RosterIndex != iCurrentRoster) && (pCrew->RosterIndex != iNextRoster))
	//	continue;
	if ((this->GetApplication() != ROSTER_OPTIMIZER) ||
	(this->GetApplication() == ROSTER_OPTIMIZER && (pCrew->RosterIndex == iCurrentRoster || pCrew->RosterIndex == iNextRoster)))
	{
	isValid = false;
	string errorMsg = "The space(Attribute=" + strAttributeA + "-" + strAttributeB;
	errorMsg += ",Roster Duty=" + strAssignmentA + "-" + strAssignmentB;
	errorMsg += ",Pairing Label=" + strLabelA + "-" + strLabelB;
	errorMsg += ",Qualifier=" + strQualifierA + "-" + strQualifierB;
	errorMsg += ") between rosters[" + boost::lexical_cast<string>(rosters[iCurrentRoster]->rosterId);
	errorMsg += "," + boost::lexical_cast<string>(rosters[iNextRoster]->rosterId);
	errorMsg += "] is less than " + strSpace + " " + strUnit + ".";
	setLegalityMessage(rosters[iCurrentRoster], pCrew, singleRule, errorMsg);
	pCrew->isLegal = false;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
	rv->rosterId = rosters[iCurrentRoster]->rosterId;
	rv->startDTUtc = lStaDT;
	rv->endDTUtc = lEndDT;
	rv->violation_msg = errorMsg;
	rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
	this->addRuleViolations(rv, singleRule);
	if (this->GetApplication() == ROSTER_OPTIMIZER){
	return false;
	}
	}
	}

	int iTemp1,iTemp2 = 0;

	if (!bDirectional)
	{
	//iTemp1 = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, strTemp1, strTemp2, strTemp3,strTemp4,base,strTemp5);
	iTemp1 = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, &temp);
	//iTemp2 = Utility::GetInstancePtr()->getNextRoster(rosters, iNextRoster, strTemp1, strTemp2, strTemp3,strTemp4,base,strTemp5);
	iTemp2 = Utility::GetInstancePtr()->getNextRoster(rosters, iNextRoster, &temp);

	if (iTemp1 < iTemp2 || iTemp2 == FAILURE)
	{
	iCurrentRoster = iTemp1;
	//if ((strTemp1 == strAttributeA) && (strTemp2 == strAssignmentA) && (strTemp3 == strLabelA))
	if (temp.assignments.size() <= 0 || temp.attributes.size() <= 0 || temp.labels.size() <= 0)
	printf("temp size=0\n");

	//if ((temp.attributes[0] == strAttributeA) && (temp.assignments[0] == strAssignmentA) && (temp.labels[0] == strLabelA)
	//	&& (temp.qualifiers[0] == strQualifierA))
	if ((strAttributeA.find(temp.attributes[0]) != string::npos)
	&& (strAssignmentA.find(temp.assignments[0]) != string::npos)
	&& (strLabelA.find(temp.labels[0]) != string::npos)
	&& (strQualifierA.find(temp.qualifiers[0]) != string::npos))
	//iNextRoster = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, strAttributeB, strAssignmentB, strLabelB, strIsReqB,base, strBEqualToBase);
	iNextRoster = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, &tempB);
	else
	//iNextRoster = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, strAttributeA, strAssignmentA, strLabelA, strIsReqA, base, strAEqualToBase);
	iNextRoster = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, &tempA);
	}
	else
	{
	iCurrentRoster = iNextRoster;
	//iNextRoster = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, strTemp1, strTemp2, strTemp3, strTemp4, base, strTemp5);
	iNextRoster = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, &temp);
	//if ((strTemp1 == strAttributeA) && (strTemp2 == strAssignmentA) && (strTemp3 == strLabelA))
	if (temp.assignments.size() <= 0 || temp.attributes.size() <= 0 || temp.labels.size() <= 0)
	printf("temp size=1\n");
	//if ((temp.attributes[0] == strAttributeA) && (temp.assignments[0] == strAssignmentA) && (temp.labels[0] == strLabelA)
	//	&& (temp.qualifiers[0]==strQualifierA))
	if ((strAttributeA.find(temp.attributes[0]) != string::npos)
	&& (strAssignmentA.find(temp.assignments[0])!=string::npos)
	&& (strLabelA.find(temp.labels[0])!=string::npos)
	&& (strQualifierA.find(temp.qualifiers[0])!=string::npos))
	{
	strTemp1 = strAttributeB;
	strTemp2 = strAssignmentB;
	strTemp3 = strLabelB;
	strTemp4 = strIsReqB;
	strTemp5 = strBEqualToBase;
	temp = tempB;
	}
	else
	{
	strTemp1 = strAttributeA;
	strTemp2 = strAssignmentA;
	strTemp3 = strLabelA;
	strTemp4 = strIsReqA;
	strTemp5 = strAEqualToBase;
	temp = tempA;
	}
	}
	}
	else
	{
	//iCurrentRoster = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, strAttributeA, strAssignmentA, strLabelA, strIsReqA, base, strAEqualToBase);
	//iNextRoster = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, strAttributeB, strAssignmentB, strLabelB, strIsReqB, base, strBEqualToBase);
	iCurrentRoster = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, &tempA);
	iNextRoster = Utility::GetInstancePtr()->getNextRoster(rosters, iCurrentRoster, &tempB);
	}

	}
	*/
	return isValid;
}

