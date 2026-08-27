#include "RuleEngine.h"

#include "TimezoneUtils.h"
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
#include "../utils/TimeUtils.h"
#include "../constant/Constants.h"

bool cmp8101(WORKDUTY_TIMES * m1, WORKDUTY_TIMES * m2)  {
	return m1->startUtcTime < m2->startUtcTime;
}

//获得WORKDUTY_TIMES的开始时间大于等于startTime的第一个WORKDUTY_TIMES
inline static int findNextWorkTimeIndex(const vector<WORKDUTY_TIMES*>& works, time_t startTime) {
	int dutysize = (int)works.size();
	//二分寻找最接近的i
	int l = 0, r = dutysize - 1, mid = 0;
	while (true) {
		mid = (l + r) / 2;
		if (mid >= r || mid <= l)break;

		if (works[mid]->startUtcTime < startTime) {
			l = mid + 1;
		}
		if (works[mid]->startUtcTime > startTime) {
			r = mid - 1;
		}
		if (works[mid]->startUtcTime == startTime) {
			break;
		}
	}

	for (int i = mid; i < dutysize; i++) {
		if (works[i]->startUtcTime >= startTime) {
			return i;
		}
	}
	return -1;
}

inline int static getEndMaxRest(const int iMaxRest, const vector<WORKDUTY_TIMES*>& works, const time_t end) {
	int nextWorkTimeIndex = findNextWorkTimeIndex(works, end);
	if (nextWorkTimeIndex != -1) {
		auto& nextWorkTime = works[nextWorkTimeIndex];
		int offsetMinutes = (int)(nextWorkTime->startLocTime - nextWorkTime->startUtcTime) / 60;
		time_t nextLocalDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(end, offsetMinutes) + (time_t)24 * 60 * 60;
		int rest = static_cast<int>(std::min(nextWorkTime->startUtcTime, nextLocalDay) - end) / 60;
		if (rest > iMaxRest) {
			return rest;
		}
	}
	return iMaxRest;
}

//check min rest 48 hours in the 168 hours before a certain roster
//1	8001001	1	,	min_rest,period,period define	48:00,168,RH
bool LegalityChecker::checkMinRestIn7Days_R5(RULE_LEGALITY * pPairing, const DBRule* singleRule)
{
	DBG_HELP("LegalityChecker::checkMinRestIn7Days_R5");
	if (singleRule->classType == RuleClassType::PO) {
		return true;
	}
	bool isValid = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	string min_rest, period, period_type, strBase, strRank, strFleet, pGroups = "*",pLevel="P",pStart="S",localNiteStart, localNiteEnd, minLocalNites;
	bool isCountLayover = false;
	//BASES,RANKS,FLEETS,MIN LIMITS,PERIOD,UNIT,UTILIZE LAYOVER

	//Assignment Level/
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		//transform(header.begin(), header.end(), header.begin(), ::toupper);
		transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

		if (header == "BASES")				strBase = headeValue;
		if (header == "RANKS")				strRank = headeValue;
		if (header == "FLEETS")				strFleet = headeValue;
		if (header == "MIN REST")			min_rest = headeValue;
		if (header == "PERIOD")				period = headeValue;
		if (header == "UNIT")				period_type = headeValue;
		if (header == "UTILIZE LAYOVER")	isCountLayover = (headeValue == "Y");

		if (header == "ASSIGNMENT GROUPS")							pGroups = headeValue;
		if (header == "ASSIGNMENT LEVEL(P/D)")						pLevel = headeValue;
		if (header == "CHECK PERIOD BY START OR END(S/E)")			pStart = headeValue;
		if (header == "LOCAL_NITE_START")	localNiteStart = headeValue;
		if (header == "LOCAL_NITE_END")		localNiteEnd = headeValue;
		if (header == "MIN_LOCAL_NITES")	minLocalNites = headeValue;
		
	}

	int iPeriod = stoi(period);
	int iMinRest = hhmmToMinutes(min_rest.c_str());

	SharedPtr<CREW> crew = this->_dbData->crewList[pPairing->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	vector<SharedPtr<CREW_BASE>>& bases = crew->baseList;
	vector<SharedPtr<CREW_RANK>>& ranks = crew->rankList;
	vector<SharedPtr<CREW_FLEET>>& fleets = crew->fleetList;
	
	//if (crew->idCrew == "0000010922" && pGroups == "SBY")
	//	printf("");

	if (rosters.size() == 0)
		return true;

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}

	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, strFleet, "*","*", lCheckedStart, lCheckedEnd))
		return true;

	string base = Utility::GetInstancePtr()->getCrewPrimaryBase(bases, lCheckedEnd);
	///TEST
	if (base.empty())
	{
		char utcBuf[100] = { 0 };
		char locBuf[100] = { 0 };
		utcToUtcStr(lCheckedEnd, utcBuf, sizeof(utcBuf));
		if (!bases.empty()) {
			//auto offsetMinutes = _dbData->getAirportOffsetMinutes(bases[bases.size() - 1]->base);
			auto& defaultBase = bases.back()->base;
			string zoneId = _dbData->getAirportZoneId(defaultBase);
			auto endLocal = TimezoneUtils::GetLocalTime(lCheckedEnd, zoneId);
			utcToUtcStr(endLocal, locBuf, sizeof(locBuf));
		}
		long long pair_id = 0;
		if (pPairing->PairingIndex >= 0)
			pair_id = this->_dbData->pairingList[pPairing->PairingIndex]->getDbId();
		Logger::getRuleLogger()->error("error: no base available for crew={} on {} (utc:{})  (pair_id={}, index={}) (window={} {})\n",
			_dbData->crewList[pPairing->crewIndex]->idCrew.c_str(), locBuf, utcBuf, pair_id, pPairing->PairingIndex,
			utcToUtcString(lCheckedStart).c_str(), utcToUtcString(lCheckedEnd).c_str());
		//Logger::getRuleLogger()->error(new exception("no base available for crew"));
	}
	
	string zoneId;
	if (base.empty())
		base = _dbData->scenario.bases[0];
	if (!base.empty() || _dbData->scenario.airline != "BR")
		zoneId = _dbData->getAirportZoneId(base);
	//op1489
	if (_dbData->scenario.airline == "BR")
		zoneId = _dbData->getAirportZoneId("TPE");
	int offsetMinutes = TimezoneUtils::GetTimezoneOffset(time(0), zoneId);
	long window_range = 168 * 60 * 60;
	if (period_type == "RH")
	{
		window_range = iPeriod * 60 * 60;
	}
	else if (period_type == "CD")
	{
		window_range = iPeriod * 60 * 60 * 24;
	}
	vector<WORKDUTY_TIMES *> works;
	for (vector<SharedPtr<ROSTER>>::iterator ix = rosters.begin(); ix != rosters.end(); ++ix)
	{
		Pairing * pg = (*ix)->pairing;

		if (RuleParams::GetInstancePtr()->isRestAssignment((*ix)->qualifier, (*ix)->duty))
			continue;

		if (!pg || !isCountLayover)
		{
			WORKDUTY_TIMES* work = new WORKDUTY_TIMES();
			work->startUtcTime = (*ix)->actStrUtc;
			work->endUtcTime = (*ix)->actRestStrUtc;
			work->needRuleCheck = (*ix)->needRuleCheck;
			work->dutyType = (*ix)->duty;
			work->startLocTime = (*ix)->actStrLoc;
			work->endLocTime = (*ix)->actEndLoc;
			works.push_back(work);
			continue;
		}

		vector<Duty *> dutylist = pg->getDutyVec();
		if (dutylist.empty())
			continue;
		if (isCountLayover)
		{
			for (size_t i = 0; i < dutylist.size(); i++)
			{
				Duty::DUTY_TYPE dt = dutylist[i]->getType();
				//20191123 ain, dutyNode代替 duty.pickupMin; 兼容旧数据当dutyNode缺失则按 duty.start-duty.pickup
				time_t start = 0, end = 0, startLoc = 0, endLoc = 0;
				shared_ptr<PairingDutyNode> firstPickup = dutylist[i]->getFirstPickup();
				shared_ptr<PairingDutyNode> lastDropoff = dutylist[i]->getLastDropoff();
				if (firstPickup && lastDropoff) {
					//auto startOffsetMinutes = _dbData->getAirportOffsetMinutes(firstPickup->getAirport());
					//auto endOffsetMinutes = _dbData->getAirportOffsetMinutes(lastDropoff->getAirport());
					start = firstPickup->getStartTimeUtcAct();
					end = lastDropoff->getEndTimeUtcAct();
					startLoc = firstPickup->getStartTimeLocAct();
					endLoc = lastDropoff->getEndTimeLocAct();
				}
				else {
					start = dutylist[i]->getStartTimeUtcAct() - dutylist[i]->getActualPickupMin() * 60;
					end = dutylist[i]->getEndTimeUtcAct() + dutylist[i]->getActualDropoffMin() * 60;
					startLoc = dutylist[i]->getStartTimeLocAct() - dutylist[i]->getActualPickupMin() * 60;
					endLoc = dutylist[i]->getEndTimeLocAct() + dutylist[i]->getActualDropoffMin() * 60;
				}
				WORKDUTY_TIMES* work = new WORKDUTY_TIMES();
				work->startUtcTime = start;
				work->endUtcTime = end;
				work->startLocTime = startLoc;
				work->endLocTime = endLoc;
				work->needRuleCheck = (*ix)->needRuleCheck;
				work->dutyType = dutylist[i]->getAssignment();
				works.push_back(work);
			}
		}
	}
	stable_sort(works.begin(), works.end(), cmp8101);

	vector<string> strAssignGoups;
	split(pGroups, '|', strAssignGoups);

	vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;

	const string& airlinecode = this->_dbData->scenario.airline;
	vector<string> assignmentsInGoups;
	for (vector<SharedPtr<DBRule_8014>>::iterator assignment = assignments.begin(); assignment != assignments.end(); ++assignment)
	{
		if (find(strAssignGoups.begin(), strAssignGoups.end(), (*assignment)->assignmentGroup) != strAssignGoups.end()
			&& (this->_dbData->version == 3 || (*assignment)->airline == airlinecode))
		{
			assignmentsInGoups.push_back((*assignment)->assignemnt);
		}
	}
	bool needRuleCheckInRange = false;
	//if (crew->idCrew == "000013"){
	//	for (auto w : works){
	//		cout << "Type: " << w->dutyType << " start: " <<
	//			utcToUtcString(w->startUtcTime + 8 * 3600) <<
	//			" end: " << utcToUtcString(w->endUtcTime + 8 * 3600) << endl;
	//	}
	//}
	for (std::size_t index = 0; index < rosters.size(); index++)
	{
		/*if (pGroups != "*" && std::find(assignmentsInGoups.begin(), assignmentsInGoups.end(), roster->duty) == assignmentsInGoups.end())
			continue;*/
		auto& roster = rosters[index];
		time_t start = 0, end = 0;//20200328 ain, init var
		if (pLevel == "D" && roster->pairing)
		{
			
			vector<Duty *> duties = roster->pairing->getDutyVec();
			//sort
			std::stable_sort(duties.begin(), duties.end(), [](Duty * n1, Duty * n2) {
				return n1->getStartTimeUtcAct() < n2->getStartTimeUtcAct();
			});

			for (std::size_t i = 0; i < duties.size(); i++ ) {
				Duty * duty = duties[i];

				if (i == 0 && roster->isMergeFdpWithBefore) {
					continue;
				}
				//bool isFerry = false;
				//20210531 ain: var init
				long long segmentId = 0;
				time_t locToUtc = 0;
				if (pGroups != "*" && std::find(assignmentsInGoups.begin(), assignmentsInGoups.end(), duty->getAssignment()) == assignmentsInGoups.end())
					continue;
				vector<Segment*> segs = duty->getSegments();
				for (std::size_t i = 0; i < segs.size(); i++){
					map<string, SharedPtr<ASSIGNMENT>>::iterator segAssignment = this->_dbData->assignmentNameMap.find(segs[i]->getAssignment());
					if (segAssignment != this->_dbData->assignmentNameMap.end() && segAssignment->second->FDP_PCT > 0){
						//isFerry = true;
						locToUtc = segs[i]->getStartTimeLocAct() - segs[i]->getStartTimeLocAct();
						segmentId = segs[i]->getSegmentId();
						break;
					}
				}

				//if (!isFerry)continue;
				if (pStart == "E")
				{
					end = duty->getEndTimeUtcAct();
				}
				else
				{
					time_t pickupTimeStart = 0;
					if (RuleParams::GetInstancePtr()->bPreFerryCount){
						shared_ptr<PairingDutyNode> pdn = Utility::GetInstancePtr()->getPairingDutyNode(duty->pairingDutyNodes, "DUTY", "BRIEF");
						if (pdn){
							pickupTimeStart = pdn->getStartLoc();
						}
						if (pickupTimeStart){
							end = pickupTimeStart + duty->getStartTimeUtcAct() - duty->getStartTimeLocAct();
						}
						else{
							end = duty->getStartTimeUtcAct() - duty->getMinPickup() * 60;
						}
					}
					else{
						shared_ptr<PairingDutyNode> pdn = Utility::GetInstancePtr()->getPairingDutyNode(duty->pairingDutyNodes, "SEGMENT", "BRIEF", segmentId);
						if (pdn){
							pickupTimeStart = pdn->getStartLoc();
							if (pickupTimeStart){
								end = pickupTimeStart + locToUtc;
							}
						}
						else{
							end = duty->getStartTimeUtcAct() - duty->getMinPickup() * 60;
						}
					}
				}
				vector<time_t> tmpEnds;
				if(period_type == "CD") {
					time_t currLocalDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(end, offsetMinutes);
					time_t nextLocalDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(end, offsetMinutes) + (time_t)24 * 60 * 60;
					tmpEnds.push_back(currLocalDay);
					tmpEnds.push_back(nextLocalDay);
				}
				else {
					tmpEnds.push_back(end);
				}

				for(auto tmpEnd : tmpEnds){
					end = tmpEnd;
					start = end - window_range;
					int iMaxRest = getMaxRestInRange(works, start, end, needRuleCheckInRange);
					// if (pStart == "E") {
					// 	//iMaxRest += static_cast<int>(end - duty->getStartTimeUtcAct() - duty->getMinPickup() * 60)/60;
					// 	iMaxRest = getEndMaxRest(iMaxRest, works, end);
					// }

					if (iMaxRest < iMinRest)
					{
						if (this->GetApplication() == ROSTER_OPTIMIZER && !needRuleCheckInRange)
							continue;
						isValid = false;
						if (this->GetApplication() == ROSTER_OPTIMIZER || this->GetApplication() == PAIRING_OPTIMIZER){
							break;
						}
						char startUtcStr[30] = { 0 };
						char endUtcStr[30] = { 0 };
						Utility::GetInstancePtr()->UTCToUTCStr(TimezoneUtils::GetLocalTime(start, zoneId), startUtcStr, sizeof(startUtcStr));
						Utility::GetInstancePtr()->UTCToUTCStr(TimezoneUtils::GetLocalTime(end - 1, zoneId), endUtcStr, sizeof(endUtcStr));

						string msg = "[UTC: {0:startUtcStr} - {1:endUtcStr}] Only {2:iMaxRestHHmm} of rest, which is less than the minimum {3:min_rest} hours in this {4:period} {5:period_type} window.";
						msg = StringUtils::Format(msg, startUtcStr, endUtcStr, TimeUtils::MinutesTohhmm(iMaxRest), min_rest, period, period_type);

						SharedPtr<CREW> ppCrew = (this->_dbData->crewList[pPairing->crewIndex]);
						this->setLegalityMessage(ppCrew, pPairing, singleRule, msg);
						pPairing->isLegal = false;
						pPairing->skipCheckInLaterIterations = true;
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->crewId = this->_dbData->crewList[pPairing->crewIndex]->idCrew;
						rv->startDTUtc = start;
						rv->endDTUtc = end;
						rv->violation_msg = msg;
						rv->type = VIOLATION_TYPE::CREW_VIOLATION;
						//OP#1448提供message参数给gantt
						rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
						rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
						rv->operation_result.insert(pair<string, string>("iMaxRest", to_string(iMaxRest))); // 客户端需要分钟数 
						rv->operation_result.insert(pair<string, string>("min_rest", min_rest));
						rv->operation_result.insert(pair<string, string>("period", period));
						rv->operation_result.insert(pair<string, string>("period_type", period_type));
						this->addRuleViolations(rv, singleRule);
					}
					else if (!localNiteStart.empty() && !localNiteEnd.empty() && !minLocalNites.empty()) {
						//OP#1797 新增iMinRest内需要有规定的休息时段
						if (!restHaveNites(works, start, end, needRuleCheckInRange, localNiteStart, localNiteEnd, minLocalNites, iMinRest)) {
							if (this->GetApplication() == ROSTER_OPTIMIZER && !needRuleCheckInRange)
								continue;
							isValid = false;
							if (this->GetApplication() == ROSTER_OPTIMIZER|| this->GetApplication() == PAIRING_OPTIMIZER) {
								break;
							}
							char startUtcStr[30] = { 0 };
							char endUtcStr[30] = { 0 };
							Utility::GetInstancePtr()->UTCToUTCStr(TimezoneUtils::GetLocalTime(start, zoneId), startUtcStr, sizeof(startUtcStr));
							Utility::GetInstancePtr()->UTCToUTCStr(TimezoneUtils::GetLocalTime(end - 1, zoneId), endUtcStr, sizeof(endUtcStr));

							string msg = "[UTC: {0:startUtcStr} - {1:endUtcStr}] Does not meet the requirement of {2:minLocalNites} local nights between {3:localNiteStart}-{4:localNiteEnd}.";
							msg = StringUtils::Format(msg, startUtcStr, endUtcStr, minLocalNites, localNiteStart, localNiteEnd);

							SharedPtr<CREW> ppCrew = (this->_dbData->crewList[pPairing->crewIndex]);
							this->setLegalityMessage(ppCrew, pPairing, singleRule, msg);
							pPairing->isLegal = false;
							pPairing->skipCheckInLaterIterations = true;
							RULE_VIOLATION* rv = new RULE_VIOLATION();
							rv->crewId = this->_dbData->crewList[pPairing->crewIndex]->idCrew;
							rv->startDTUtc = start;
							rv->endDTUtc = end;
							rv->violation_msg = msg;
							rv->type = VIOLATION_TYPE::CREW_VIOLATION;
							//OP#1448提供message参数给gantt
							rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
							rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
							rv->operation_result.insert(pair<string, string>("localNiteStart", localNiteStart));
							rv->operation_result.insert(pair<string, string>("localNiteEnd", localNiteEnd));
							rv->operation_result.insert(pair<string, string>("minLocalNites", minLocalNites));
							rv->operation_result.insert(pair<string, string>("period", period));
							rv->operation_result.insert(pair<string, string>("period_type", period_type));
							this->addRuleViolations(rv, singleRule);
						}
					}
				}	
			}
		}
		else
		{
			if (pStart == "E")
			{
				end = roster->getRestStartUtcAct();
			}
			else
			{
				end = roster->getStartTimeUtcAct();
			}

			vector<time_t> tmpEnds;
			if(period_type == "CD") {
				time_t currLocalDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(end, offsetMinutes);
				time_t nextLocalDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(end, offsetMinutes) + (time_t)24 * 60 * 60;
				tmpEnds.push_back(currLocalDay);
				tmpEnds.push_back(nextLocalDay);
			}
			else {
				tmpEnds.push_back(end);
			}
			for(auto tmpEnd : tmpEnds) {	
				end = tmpEnd;
				start = end - window_range;
				int iMaxRest = getMaxRestInRange(works, start, end, needRuleCheckInRange);
				// if (pStart == "E") {
				// 	//iMaxRest += static_cast<int>(end - roster->getStartTimeUtcAct())/60;
				// 	iMaxRest = getEndMaxRest(iMaxRest, works, end);
				// }

				if (iMaxRest < iMinRest)
				{
					if (this->GetApplication() == ROSTER_OPTIMIZER && !needRuleCheckInRange)
						continue;
					isValid = false;
					if (this->GetApplication() == ROSTER_OPTIMIZER || this->GetApplication() == PAIRING_OPTIMIZER){
						break;
					}
					char startUtcStr[30] = { 0 };
					char endUtcStr[30] = { 0 };
					Utility::GetInstancePtr()->UTCToUTCStr(TimezoneUtils::GetLocalTime(start, zoneId), startUtcStr, sizeof(startUtcStr));
					Utility::GetInstancePtr()->UTCToUTCStr(TimezoneUtils::GetLocalTime(end - 1, zoneId), endUtcStr, sizeof(endUtcStr));

					string msg = "[UTC: {0:startUtcStr} - {1:endUtcStr}] Only {2:iMaxRestHHmm} of rest, which is less than the minimum {3:min_rest} hours in this {4:period} {5:period_type} window.";
					msg = StringUtils::Format(msg, startUtcStr, endUtcStr, TimeUtils::MinutesTohhmm(iMaxRest), min_rest, period, period_type);

					SharedPtr<CREW> ppCrew = (this->_dbData->crewList[pPairing->crewIndex]);
					this->setLegalityMessage(ppCrew, pPairing, singleRule, msg);
					pPairing->isLegal = false;
					pPairing->skipCheckInLaterIterations = true;
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->crewId = this->_dbData->crewList[pPairing->crewIndex]->idCrew;
					rv->startDTUtc = start;
					rv->endDTUtc = end;
					rv->violation_msg = msg;
					rv->type = VIOLATION_TYPE::CREW_VIOLATION;
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
					rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
					rv->operation_result.insert(pair<string, string>("iMaxRest", std::to_string(iMaxRest)));
					rv->operation_result.insert(pair<string, string>("min_rest", min_rest));
					rv->operation_result.insert(pair<string, string>("period", period));
					rv->operation_result.insert(pair<string, string>("period_type", period_type));
					this->addRuleViolations(rv, singleRule);
				}
				else if (!localNiteStart.empty() && !localNiteEnd.empty() && !minLocalNites.empty()) {
					if (!restHaveNites(works, start, end, needRuleCheckInRange, localNiteStart, localNiteEnd, minLocalNites, iMinRest)) {
						if (this->GetApplication() == ROSTER_OPTIMIZER && !needRuleCheckInRange)
							continue;
						isValid = false;
						if (this->GetApplication() == ROSTER_OPTIMIZER || this->GetApplication() == PAIRING_OPTIMIZER) {
							break;
						}
						char startUtcStr[30] = { 0 };
						char endUtcStr[30] = { 0 };
						Utility::GetInstancePtr()->UTCToUTCStr(TimezoneUtils::GetLocalTime(start, zoneId), startUtcStr, sizeof(startUtcStr));
						Utility::GetInstancePtr()->UTCToUTCStr(TimezoneUtils::GetLocalTime(end - 1, zoneId), endUtcStr, sizeof(endUtcStr));

						string msg = "[UTC: {0:startUtcStr} - {1:endUtcStr}] Does not meet the requirement of {2:minLocalNites} local nights between {3:localNiteStart}-{4:localNiteEnd}.";
						msg = StringUtils::Format(msg, startUtcStr, endUtcStr, minLocalNites, localNiteStart, localNiteEnd);

						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->crewId = this->_dbData->crewList[pPairing->crewIndex]->idCrew;
						rv->startDTUtc = start;
						rv->endDTUtc = end;
						rv->violation_msg = msg;
						rv->type = VIOLATION_TYPE::CREW_VIOLATION;
						//OP#1448提供message参数给gantt
						rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
						rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
						rv->operation_result.insert(pair<string, string>("localNiteStart", localNiteStart));
						rv->operation_result.insert(pair<string, string>("localNiteEnd", localNiteEnd));
						rv->operation_result.insert(pair<string, string>("minLocalNites", minLocalNites));
						rv->operation_result.insert(pair<string, string>("period", period));
						rv->operation_result.insert(pair<string, string>("period_type", period_type));
						this->addRuleViolations(rv, singleRule);
					}
				}
			}
		}
	}

	//20190418 ain, mantis#5183, clear mem
	ClearVector(WORKDUTY_TIMES, works);

	return isValid;
}

//8101 po检查
bool LegalityChecker::checkMinRestIn7Days_R5(Pairing* p){

	if (this->_application == ROSTER_OPTIMIZER)
		return true;

	if (!p)return true;
	bool isValid = true;
	const vector<DBRule>& dutyBuilder = this->_dbData->getRuleFunctions(RULES::MIN_REST_IN_XHOURS_R5);
	for (std::size_t i = 0; i < dutyBuilder.size(); i++){
		DBRule singleRule = dutyBuilder[i];
		if (singleRule.classType == RuleClassType::RO) {
			continue;
		}
		auto& parameter = singleRule.params;
		string assignmentA, assignmentB, qualifierA, qualifierB;
		string min_rest, period, period_type, strBase, strRank, strFleet, pGroups = "*", pLevel = "P", pStart = "S", localNiteStart, localNiteEnd, minLocalNites;
		bool isCountLayover = false;
		for (auto& iter : parameter)
		{
			string header = iter.first;
			header = trim(header);
			string headeValue = trim(iter.second);//20191011 ain, trim
			if (header == "BASES")				strBase = headeValue;
			if (header == "RANKS")				strRank = headeValue;
			if (header == "FLEETS")				strFleet = headeValue;
			if (header == "MIN REST")			min_rest = headeValue;
			if (header == "PERIOD")				period = headeValue;
			if (header == "UNIT")				period_type = headeValue;
			if (header == "UTILIZE LAYOVER")	isCountLayover = (headeValue == "Y");

			if (header == "ASSIGNMENT GROUPS")							pGroups = headeValue;
			if (header == "ASSIGNMENT LEVEL(P/D)")						pLevel = headeValue;
			if (header == "CHECK PERIOD BY START OR END(S/E)")			pStart = headeValue;
			if (header == "LOCAL_NITE_START")	localNiteStart = headeValue;
			if (header == "LOCAL_NITE_END")		localNiteEnd = headeValue;
			if (header == "MIN_LOCAL_NITES")	minLocalNites = headeValue;
		}

		int iPeriod = stoi(period);
		int iMinRest = hhmmToMinutes(min_rest.c_str());

		vector<string> strAssignGoups;
		split(pGroups, '|', strAssignGoups);

		const vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;

		const string& airlinecode = this->_dbData->scenario.airline;
		vector<string> assignmentsInGoups;
		if (pGroups != "*")
		{
			for (const auto& assignment : assignments)
			{
				if (find(strAssignGoups.begin(), strAssignGoups.end(), assignment->assignmentGroup) != strAssignGoups.end()
					&& (this->_dbData->version == 3 || assignment->airline == airlinecode))
				{
					assignmentsInGoups.push_back(assignment->assignemnt);
				}
			}
		}

		//if (p->getDbId() == 12582544 && pGroups == "SBY")
		//	printf("");

		//int offsetMinutes = 0;
		string base = p->getBase();
		//if (!base.empty() || _dbData->scenario.airline != "BR")
		//	offsetMinutes = _dbData->getAirportOffsetMinutes(base);
		string zoneId;
		if (!base.empty() || _dbData->scenario.airline != "BR")
			zoneId = _dbData->getAirportZoneId(base);
		//op1489
		if (_dbData->scenario.airline == "BR")
			zoneId = _dbData->getAirportZoneId("TPE");
		int offsetMinutes = TimezoneUtils::GetTimezoneOffset(time(0), zoneId);

		long window_range = 168 * 60 * 60;
		if (period_type == "RH")
		{
			window_range = iPeriod * 60 * 60;
		}
		else if (period_type == "CD")
		{
			window_range = iPeriod * 60 * 60 * 24;
		}

		vector<WORKDUTY_TIMES *> works;


		if (!p || !isCountLayover)
		{
			//WORKDUTY_TIMES* work = new WORKDUTY_TIMES();
			//work->startUtcTime = p->getStartTimeUtcAct();
			//work->endUtcTime = p->getEndTimeUtcAct();
			//work->needRuleCheck = true;
			//works.push_back(work);
			continue;
		}
		vector<Duty *> dutylist = p->getDutyVec();
		if (dutylist.empty())
			continue;
		if (isCountLayover)
		{
			for (size_t i = 0; i < dutylist.size(); i++)
			{
				Duty::DUTY_TYPE dt = dutylist[i]->getType();
				time_t start = 0, end = 0, startLoc = 0, endLoc = 0;

				if (pGroups != "*" && std::find(assignmentsInGoups.begin(), assignmentsInGoups.end(), dutylist[i]->getAssignment()) == assignmentsInGoups.end())
					continue;

				//mantis#9221修正
				shared_ptr<PairingDutyNode> firstPickup = dutylist[i]->getFirstPickup();
				shared_ptr<PairingDutyNode> lastDropoff = dutylist[i]->getLastDropoff();
				if (firstPickup && lastDropoff) {
					//auto startOffsetMinutes = _dbData->getAirportOffsetMinutes(firstPickup->getAirport());
					//auto endOffsetMinutes = _dbData->getAirportOffsetMinutes(lastDropoff->getAirport());
					start = firstPickup->getStartTimeUtcAct();
					end = lastDropoff->getEndTimeUtcAct();
					startLoc = firstPickup->getStartTimeLocAct();
					endLoc = lastDropoff->getEndTimeLocAct();
				}
				else {
					start = dutylist[i]->getStartTimeUtcAct() - dutylist[i]->getActualPickupMin() * 60;
					end = dutylist[i]->getEndTimeUtcAct() + dutylist[i]->getActualDropoffMin() * 60;
					startLoc = dutylist[i]->getStartTimeLocAct() - dutylist[i]->getActualPickupMin() * 60;
					endLoc = dutylist[i]->getEndTimeLocAct() + dutylist[i]->getActualDropoffMin() * 60;
				}
				//time_t start = dutylist[i]->getStartTimeUtcAct() - dutylist[i]->getActualPickupMin() * 60;
				//time_t end = dutylist[i]->getEndTimeUtcAct() + dutylist[i]->getActualDropoffMin() * 60;
				if ((dt != Duty::DUTY_PAIRING_REST) && (dt != Duty::DUTY_BLANK_DAY))
				{
					WORKDUTY_TIMES* work = new WORKDUTY_TIMES();
					work->startUtcTime = start;
					work->endUtcTime = end;
					work->startLocTime = startLoc;
					work->endLocTime = endLoc;
					work->needRuleCheck = true;
					works.push_back(work);
				}
			}
		}
		bool needRuleCheckInRange = false;
		stable_sort(works.begin(), works.end(), cmp8101);
		if (pLevel == "D")
		{
			time_t start, end;
			vector<Duty *> duties = p->getDutyVec();
			for (auto& duty : duties)
			{
				bool isFerry = false;
				long long segmentId;
				time_t locToUtc;
				vector<Segment*> segs = duty->getSegments();
				for (std::size_t i = 0; i < segs.size(); i++){
					map<string, SharedPtr<ASSIGNMENT>>::iterator segAssignment = this->_dbData->assignmentNameMap.find(segs[i]->getAssignment());
					if (segAssignment != this->_dbData->assignmentNameMap.end() && segAssignment->second->FDP_PCT > 0){
						isFerry = true;
						locToUtc = segs[i]->getStartTimeLocAct() - segs[i]->getStartTimeLocAct();
						segmentId = segs[i]->getSegmentId();
						break;
					}
				}
				if (!isFerry)continue;
				time_t pickupTimeStart = 0;
				if (RuleParams::GetInstancePtr()->bPreFerryCount){
					shared_ptr<PairingDutyNode> pdn = Utility::GetInstancePtr()->getPairingDutyNode(duty->pairingDutyNodes, "DUTY", "BRIEF");
					if (pdn){
						pickupTimeStart = pdn->getStartLoc();
					}
					if (pickupTimeStart){
						end = pickupTimeStart + duty->getStartTimeUtcAct() - duty->getStartTimeLocAct();
					}
					else{
						end = duty->getStartTimeUtcAct() - duty->getMinPickup() * 60;
					}
				}
				else{
					shared_ptr<PairingDutyNode> pdn = Utility::GetInstancePtr()->getPairingDutyNode(duty->pairingDutyNodes, "SEGMENT", "BRIEF", segmentId);
					if (pdn){
						pickupTimeStart = pdn->getStartLoc();
						if (pickupTimeStart){
							end = pickupTimeStart + locToUtc;
						}
					}
					else{
						end = duty->getStartTimeUtcAct() - duty->getMinPickup() * 60;
					}
				}

				vector<time_t> tmpEnds;
				if(period_type == "CD") {
					time_t currLocalDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(end, offsetMinutes);
					time_t nextLocalDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(end, offsetMinutes) + (time_t)24 * 60 * 60;
					tmpEnds.push_back(currLocalDay);
					tmpEnds.push_back(nextLocalDay);
				}
				else {
					tmpEnds.push_back(end);
				}

				for(auto tmpEnd : tmpEnds){
					end = tmpEnd;
					start = end - window_range;
					int iMaxRest = getMaxRestInRange(works, start, end, needRuleCheckInRange);

					if (iMaxRest < iMinRest)
					{
						isValid = false;
						if (this->GetApplication() == PAIRING_OPTIMIZER && !needRuleCheckInRange)
							continue;

						if (this->GetApplication() == PAIRING_OPTIMIZER || this->GetApplication() == PAIRING_OPTIMIZER){
							break;
						}
						char startUtcStr[30] = { 0 };
						char endUtcStr[30] = { 0 };
						Utility::GetInstancePtr()->UTCToUTCStr(TimezoneUtils::GetLocalTime(start, zoneId), startUtcStr, sizeof(startUtcStr));
						Utility::GetInstancePtr()->UTCToUTCStr(TimezoneUtils::GetLocalTime(end - 1, zoneId), endUtcStr, sizeof(endUtcStr));

						string msg = "[" + string(startUtcStr) + " - " + string(endUtcStr) + "] Only " + Utility::GetInstancePtr()->iToa(iMaxRest / 60) + ":";
						msg += Utility::GetInstancePtr()->iToa(iMaxRest % 60) + " rest < " + min_rest + " hours in this " + period + " " + period_type + " window.";
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->pairingId = p->getDbId();
						rv->startDTUtc = start;
						rv->endDTUtc = end;
						rv->violation_msg = msg;
						rv->type = VIOLATION_TYPE::CREW_VIOLATION;
						//OP#1448提供message参数给gantt
						rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
						rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
						rv->operation_result.insert(pair<string, string>("iMaxRest", Utility::GetInstancePtr()->iToa(iMaxRest)));
						rv->operation_result.insert(pair<string, string>("min_rest", min_rest));
						rv->operation_result.insert(pair<string, string>("period", period));
						rv->operation_result.insert(pair<string, string>("period_type", period_type));
						this->addRuleViolations(rv, &singleRule);
					}
					else if (!localNiteStart.empty() && !localNiteEnd.empty() && !minLocalNites.empty()) {
						if (!restHaveNites(works, start, end, needRuleCheckInRange, localNiteStart, localNiteEnd, minLocalNites, iMinRest)) {
							if (this->GetApplication() == ROSTER_OPTIMIZER && !needRuleCheckInRange)
								continue;
							isValid = false;
							if (this->GetApplication() == ROSTER_OPTIMIZER || this->GetApplication() == PAIRING_OPTIMIZER) {
								break;
							}
							char startUtcStr[30] = { 0 };
							char endUtcStr[30] = { 0 };
							Utility::GetInstancePtr()->UTCToUTCStr(TimezoneUtils::GetLocalTime(start, zoneId), startUtcStr, sizeof(startUtcStr));
							Utility::GetInstancePtr()->UTCToUTCStr(TimezoneUtils::GetLocalTime(end - 1, zoneId), endUtcStr, sizeof(endUtcStr));

							string msg = "[UTC: {0:startUtcStr} - {1:endUtcStr}] Does not meet the requirement of {2:minLocalNites} local nights between {3:localNiteStart}-{4:localNiteEnd}.";
							msg = StringUtils::Format(msg, startUtcStr, endUtcStr, minLocalNites, localNiteStart, localNiteEnd);

							RULE_VIOLATION* rv = new RULE_VIOLATION();
							rv->pairingId = p->getDbId();
							rv->startDTUtc = start;
							rv->endDTUtc = end;
							rv->violation_msg = msg;
							rv->type = VIOLATION_TYPE::CREW_VIOLATION;
							//OP#1448提供message参数给gantt
							rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
							rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
							rv->operation_result.insert(pair<string, string>("localNiteStart", localNiteStart));
							rv->operation_result.insert(pair<string, string>("localNiteEnd", localNiteEnd));
							rv->operation_result.insert(pair<string, string>("minLocalNites", minLocalNites));
							rv->operation_result.insert(pair<string, string>("period", period));
							rv->operation_result.insert(pair<string, string>("period_type", period_type));
							this->addRuleViolations(rv, &singleRule);
						}
					}
				}
			}

		}
		ClearVector(WORKDUTY_TIMES, works);

	}
	return isValid;
};
bool LegalityChecker::checkMinRestIn7Days_R5(vector<Duty*>& dutys){
	if (dutys.size() == 0)return true;
	bool isValid = true;
	string assignmentA, assignmentB, qualifierA, qualifierB;
	string min_rest, period, period_type, strBase, strRank, strFleet, pGroups = "*", pLevel = "P", pStart = "S";
	time_t timeLength = dutys[dutys.size() - 1]->getEndTimeUtcAct() - dutys[0]->getStartTimeUtcAct();
	//mantis#7080 相关逻辑修正
	if (timeLength <= 4 * 24 * 60 * 60){
		return true;
	}
	else if (timeLength <= 5 * 24 * 60 * 60){
		time_t startTimeStamp = dutys[dutys.size() - 1]->getStartTimeUtcAct() % (24 * 60 * 60);
		time_t endTimeStamp = dutys[0]->getStartTimeUtcAct() % (24 * 60 * 60);
		if (startTimeStamp >= endTimeStamp){
			return true;
		}
		return false;
	}
	//int offsetMinutes = 0;
	string base = dutys[0]->getDepStation();
	//找到第一个不为空的base
	std::size_t index = 0;
	while (dutys[index]->getSegments().size() == 0){
		index++;
		if (index >= dutys.size())break;
	}
	if (index >= dutys.size())return true;
	if (base.size() == 0){
		base = dutys[index]->getFirstSegment()->getDepStation();
	}

	//if (!base.empty() || _dbData->scenario.airline != "BR")
	//	offsetMinutes = _dbData->getAirportOffsetMinutes(base);

	long window_range = 144 * 60 * 60;
	int iMinRest = 48 * 60 * 60;

	vector<WORKDUTY_TIMES *> works;

	for (size_t i = 0; i < dutys.size(); i++)
	{
		Duty::DUTY_TYPE dt = dutys[i]->getType();
		time_t start = dutys[i]->getStartTimeUtcAct() - dutys[i]->getActualPickupMin() * 60;
		time_t end = dutys[i]->getEndTimeUtcAct() + dutys[i]->getActualDropoffMin() * 60;
		if ((dt != Duty::DUTY_PAIRING_REST) && (dt != Duty::DUTY_BLANK_DAY))
		{
			WORKDUTY_TIMES* work = new WORKDUTY_TIMES();
			work->startUtcTime = start;
			work->endUtcTime = end;
			work->needRuleCheck = true;
			works.push_back(work);
		}
	}
	bool needRuleCheckInRange = false;
	stable_sort(works.begin(), works.end(), cmp8101);
	time_t start, end;
	for (auto& duty : dutys)
	{
		bool isFerry = false;
		long long segmentId;
		time_t locToUtc;
		vector<Segment*> segs = duty->getSegments();
		for (std::size_t i = 0; i < segs.size(); i++){
			map<string, SharedPtr<ASSIGNMENT>>::iterator segAssignment = this->_dbData->assignmentNameMap.find(segs[i]->getAssignment());
			if (segAssignment != this->_dbData->assignmentNameMap.end() && segAssignment->second->FDP_PCT > 0){
				isFerry = true;
				locToUtc = segs[i]->getStartTimeLocAct() - segs[i]->getStartTimeLocAct();
				segmentId = segs[i]->getSegmentId();
				break;
			}
		}
		if (!isFerry)continue;
		time_t pickupTimeStart = 0;
		if (RuleParams::GetInstancePtr()->bPreFerryCount){
			shared_ptr<PairingDutyNode> pdn = Utility::GetInstancePtr()->getPairingDutyNode(duty->pairingDutyNodes, "DUTY", "BRIEF");
			if (pdn){
				pickupTimeStart = pdn->getStartLoc();
			}
			if (pickupTimeStart){
				end = pickupTimeStart + duty->getStartTimeUtcAct() - duty->getStartTimeLocAct();
			}
			else{
				end = duty->getStartTimeUtcAct() - duty->getMinPickup() * 60;
			}
		}
		else{
			shared_ptr<PairingDutyNode> pdn = Utility::GetInstancePtr()->getPairingDutyNode(duty->pairingDutyNodes, "SEGMENT", "BRIEF", segmentId);
			if (pdn){
				pickupTimeStart = pdn->getStartLoc();
				if (pickupTimeStart){
					end = pickupTimeStart + locToUtc;
				}
			}
			else{
				end = duty->getStartTimeUtcAct() - duty->getMinPickup() * 60;
			}
		}
		start = end - window_range;
		int iMaxRest = getMaxRestInRange(works, start, end, needRuleCheckInRange);

		if (iMaxRest < iMinRest)
		{
			ClearVector(WORKDUTY_TIMES, works);
			return false;
		}
	}
	ClearVector(WORKDUTY_TIMES, works);
	return isValid;
};
