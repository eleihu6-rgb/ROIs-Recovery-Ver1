#include "RuleEngine.h"
#include "Utility.h"

#include <ctime>
#include <algorithm>
#include <cctype>

#include "CrewDB.h"
#include "UtilFunc.h"
#include <OrLog.h>
#include "utils/DutyUtils.h"
#include "utils/TimeUtils.h"
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"

namespace {
bool isFlyOrDhdSegment(const Segment* seg) {
	const std::string& assignment = seg->getAssignment();
	return assignment == "FLY" || assignment == "DHD";
}

bool isSameAircraftForRule2004(const Segment* prevSeg, const Segment* curSeg) {
	if (!isFlyOrDhdSegment(prevSeg) || !isFlyOrDhdSegment(curSeg))
		return true;

	// first if we have tail number, ccompare tail / register
	const std::string& prevTail = prevSeg->getTailNum();
	const std::string& curTail = curSeg->getTailNum();
	if (!prevTail.empty() && !curTail.empty())
		return prevTail == curTail;

	// next check if two flights are same fleet
	if (prevSeg->getFleetCD() != curSeg->getFleetCD())
		return false;

	// next check if current is onward flight of prev flight
	auto& nextNum = prevSeg->getNextLegNo();
	if (!nextNum.empty() && curSeg->getFlightNumber() != nextNum)
		return false;

	return true;
}

std::string secondsToHHmm(const long seconds) {
	const int minutes = static_cast<int>(seconds / 60);
	return TimeUtils::MinutesTohhmm(minutes);
}

std::string buildExceededMsg(const std::string& subject, const std::string& actual, const std::string& limit) {
	return subject + " exceeds the limit (actual=" + actual + ", limit=" + limit + ").";
}
}  // namespace


bool LegalityChecker::checkDutyLimitation(vector<Duty *> duties, const DBRule* singleRule, string base)
{
	if (duties.size() == 0)
		return true;

	DBG_HELP("LegalityChecker::checkDutyLimitation");
	bool bReturn = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	string strDefinition, strValue;
	//ISDUTYBELONGTODIFFERENTDAYCHECKED, DISCOUNTFACTORFORDHDBLKTIME
	string maxNrFlySegsInDuty, maxNrNonoperateLegsInDuty, maxNrAircraftChangeInDuty;
	string maxNrConsecutiveDhd, maxNrDHDInDuty, isDhdAllowedInMiddleDuty, maxDutyDP;
	string isDutySegmentsInSameCalendarDay, totalSegsInDuty = "99", isDutyBelongToDifferentDay;
	string isDHDMustBetweenBaseAndLOStation, isInternationalDHDallowed;
	string maxNrGRDCommuteInDuty = "99", maxNrAircraftchangsAndLTInDuty = "99", maxFlightBLHAllowDHD = "999:00";
	string overNightFlyThredHold;
	string maxFlyTimeInDuty = "999:00", pureDeadheadDutyAllowed = "Y", maxFdpWithAircraftChange = "999:00";
	rule2004* cache = (rule2004*)singleRule->parsedParam.get();
	maxNrFlySegsInDuty = cache->maxNrFlySegsInDuty;
	maxNrNonoperateLegsInDuty = cache->maxNrNonoperateLegsInDuty;
	maxNrAircraftChangeInDuty = cache->maxNrAircraftChangeInDuty;
	maxNrConsecutiveDhd = cache->maxNrConsecutiveDhd;
	maxNrDHDInDuty = cache->maxNrDHDInDuty;
	isDhdAllowedInMiddleDuty = cache->isDhdAllowedInMiddleDuty;
	isDutySegmentsInSameCalendarDay = cache->isDutySegmentsInSameCalendarDay;
	maxNrGRDCommuteInDuty = cache->maxNrGRDCommuteInDuty;
	isDutyBelongToDifferentDay = cache->isDutyBelongToDifferentDayChecked;
	maxNrAircraftchangsAndLTInDuty = cache->maxNrAircraftchangsAndLTInDuty;
	isDHDMustBetweenBaseAndLOStation = cache->isDHDmustBetweenBaseAndLOStation;
	totalSegsInDuty = cache->totalSegsInDuty;
	maxFlightBLHAllowDHD = cache->maxFlightBLHAllowDHD;
	isInternationalDHDallowed = cache->isInternationalDHDallowed;
	overNightFlyThredHold = cache->overNightFlyThredhold;
	maxDutyDP = cache->maxDutyDP;
	maxFlyTimeInDuty = cache->maxFlyTimeInDuty;
	pureDeadheadDutyAllowed = cache->pureDeadheadDutyAllowed;
	maxFdpWithAircraftChange = cache->maxFdpWithAircraftChange;
	//mantis#3610, ruleParam.value检查
	if (totalSegsInDuty.empty()) {
		Logger::getRuleLogger()->error("ERROR: invalid data, paramName='totalSegsInDuty' not found in rule 2004\n");
		return false;
	}
	int iOverNightFlyThredHoldSec = 0;
	if (overNightFlyThredHold != "")
	{
		iOverNightFlyThredHoldSec = hhmmToMinutes(overNightFlyThredHold.c_str()) * 60;
	}
	int iMaxDutyDPInSec = 0;
	if (maxDutyDP != "")
	{
		iMaxDutyDPInSec = hhmmToMinutes(maxDutyDP.c_str()) * 60;
	}
	int iMaxFlyTimeInSec = 999 * 3600;
	if (!maxFlyTimeInDuty.empty() && maxFlyTimeInDuty != "*")
	{
		iMaxFlyTimeInSec = hhmmToMinutes(maxFlyTimeInDuty.c_str()) * 60;
	}
	int iMaxFdpWithAcChangeInSec = 999 * 3600;
	if (!maxFdpWithAircraftChange.empty() && maxFdpWithAircraftChange != "*")
	{
		iMaxFdpWithAcChangeInSec = hhmmToMinutes(maxFdpWithAircraftChange.c_str()) * 60;
	}
	bool isAllDutiesInDifferentDay = true;
	string base1 = (duties[0]->getBase());
	if (base != "")
		base1 = base;
	else if (base1 == "")
		base1 = duties[0]->getDepStation();
	//auto offsetMinutes = this->_dbData->getAirportOffsetMinutes(base1);
	// 法规2004中isAllDutiesInDifferentDay日历日按照基地时区计算。下一个duty的时区可能不同，需要获得offset，不能直接使用下一个duty的本地时
	//auto offsetMinutes = DutyUtils::GetTimeZoneOffsetByDep(*duties.front(), _dbData);
	// performance: assume duty time setup correctly, duty local time - duty utc time = offset minutes
	auto offsetMinutes = (duties.front()->getStartTimeLocAct() - duties.front()->getStartTimeUtcAct()) / 60;
	if (duties.front()->getStartTimeLocAct() == 0) {
		offsetMinutes = DutyUtils::GetTimeZoneOffsetByDep(*duties.front(), _dbData);
	}

	//time_t pairingDayStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(duties[0]->getStartTimeUtcAct(), offset);
	for (std::size_t d = 0; d < duties.size(); d++)
	{
		Duty * duty = duties[d];
		time_t startTime = duty->getStartTimeUtcAct();
		//auto dutyOffsetMinutes = this->_dbData->getAirportOffsetMinutes(duty->getDepStation());
		//auto dutyOffsetMinutes = DutyUtils::GetTimeZoneOffsetByDep(*duty, _dbData);
		// performance: assume duty time setup correctly, duty local time - duty utc time = offset minutes
		auto dutyOffsetMinutes = (duty->getStartTimeLocAct() - duty->getStartTimeUtcAct()) / 60;
		if (duty->getStartTimeLocAct() == 0) {
			dutyOffsetMinutes = DutyUtils::GetTimeZoneOffsetByDep(*duty, _dbData);
		}
		time_t dayStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(startTime, dutyOffsetMinutes);
		
		//if (duty->getPairingId() == 26135259)
		//	printf("");

		if (d < duties.size() - 1)
		{
			if (duties[d + 1]->getStartTimeUtcAct() - Utility::GetInstancePtr()->getLocalDayStartInUTC(startTime, offsetMinutes) < 24 * 3600)
				isAllDutiesInDifferentDay = false;

			if ((isDutyBelongToDifferentDay == "Y" && !isAllDutiesInDifferentDay && duties.size() > 1))
			{
				if (this->_application == PAIRING_OPTIMIZER)
					return false;

				bReturn = false;
				//setLegalityMessage(duties[d], NULL, singleRule, "The duties in the pairing must operate in different day.");
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->pairingId = duties[d]->getPairingId();
				rv->dutySequenceNumber = duties[d]->getDutySeq();
				rv->startDTUtc = duties[d]->getStartTimeUtcAct();
				rv->endDTUtc = duties[d]->getEndTimeUtcAct();
				rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
				rv->idRule = singleRule->idRule;
				rv->ruleParamId = singleRule->idRuleParam;
				time_t baseDayStartUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(startTime, offsetMinutes);
				time_t baseDayEndUtc = baseDayStartUtc + 24 * 3600;
				rv->violation_msg = "Duties must start on different calendar days (next duty starts at "
					+ utcToUtcString(duties[d + 1]->getStartTimeUtcAct())
					+ " within base day window UTC=[" + utcToUtcString(baseDayStartUtc) + "," + utcToUtcString(baseDayEndUtc) + "]).";
				rv->operation_result.insert(pair<string, string>("ruleId", "2004.1"));
				rv->operation_result.insert(pair<string, string>("isDutyBelongToDifferentDayChecked", isDutyBelongToDifferentDay));
				rv->operation_result.insert(pair<string, string>("dutiesMustStartOnDifferentDay", isDutyBelongToDifferentDay));
				rv->operation_result.insert(pair<string, string>("nextDutyStartUtc", utcToUtcString(duties[d + 1]->getStartTimeUtcAct())));
				this->addRuleViolations(rv, singleRule);
				isAllDutiesInDifferentDay = true;
			}

		}

		//MAXNRAIRCRAFTCHANGEINDUTY
		if ((int)duty->getSegments().size() > stoi(totalSegsInDuty))
		{
			if (this->_application == PAIRING_OPTIMIZER)
				return false;

			bReturn = false;
			//setLegalityMessage(duties[d], NULL, singleRule, "Number of segments in the duty exceeds the limitation(" + totalSegsInDuty + ").");
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->pairingId = duties[d]->getPairingId();
			rv->dutySequenceNumber = duties[d]->getDutySeq();
			rv->startDTUtc = duties[d]->getStartTimeUtcAct();
			rv->endDTUtc = duties[d]->getEndTimeUtcAct();
			rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
			rv->idRule = singleRule->idRule;
			rv->ruleParamId = singleRule->idRuleParam;
			rv->violation_msg = buildExceededMsg("The number of segments in the duty",
				std::to_string(duty->getSegments().size()), totalSegsInDuty);
			rv->operation_result.insert(pair<string, string>("ruleId", "2004.2"));
			rv->operation_result.insert(pair<string, string>("totalSegsInDuty", totalSegsInDuty));
			rv->operation_result.insert(pair<string, string>("actualTotalSegsInDuty", std::to_string(duty->getSegments().size())));
			this->addRuleViolations(rv, singleRule);
		}

		//MAXDUTYDP
		if (duty->getDPInSecs() > iMaxDutyDPInSec)
		{
			if (this->_application == PAIRING_OPTIMIZER)
				return false;

			bReturn = false;
			//setLegalityMessage(duties[d], NULL, singleRule, "DP in the duty exceeds the limitation(" + maxDutyDP + ").");
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->pairingId = duties[d]->getPairingId();
			rv->dutySequenceNumber = duties[d]->getDutySeq();
			rv->startDTUtc = duties[d]->getStartTimeUtcAct();
			rv->endDTUtc = duties[d]->getEndTimeUtcAct();
			rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
			rv->idRule = singleRule->idRule;
			rv->ruleParamId = singleRule->idRuleParam;
			rv->violation_msg = buildExceededMsg("The Duty Period in the duty",
				secondsToHHmm(static_cast<long>(duty->getDPInSecs())), maxDutyDP);
			rv->operation_result.insert(pair<string, string>("ruleId", "2004.3"));
			rv->operation_result.insert(pair<string, string>("maxDutyDP", maxDutyDP));
			rv->operation_result.insert(pair<string, string>("actualDutyDP", secondsToHHmm(static_cast<long>(duty->getDPInSecs()))));
			this->addRuleViolations(rv, singleRule);
		}

		vector<Segment*> segments = duty->getSegments();
		if (pureDeadheadDutyAllowed == "N")
		{
			bool isPureDeadheadDuty = !segments.empty();
			for (auto seg : segments) {
				if (seg->getAssignment() != "DHD") {
					isPureDeadheadDuty = false;
					break;
				}
			}
			if (isPureDeadheadDuty) {
				if (this->_application == PAIRING_OPTIMIZER)
					return false;
				bReturn = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->pairingId = duty->getPairingId();
				rv->dutySequenceNumber = duty->getDutySeq();
				rv->startDTUtc = duty->getStartTimeUtcAct();
				rv->endDTUtc = duty->getEndTimeUtcAct();
				rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
				rv->idRule = singleRule->idRule;
				rv->ruleParamId = singleRule->idRuleParam;
				rv->violation_msg = "Pure deadhead duties are not permitted (pureDeadheadDutyAllowed=N).";
				rv->operation_result.insert(pair<string, string>("ruleId", "2004.16"));
				rv->operation_result.insert(pair<string, string>("pureDeadheadDutyAllowed", pureDeadheadDutyAllowed));
				this->addRuleViolations(rv, singleRule);
			}
		}

		int iFlyLegs = duty->getNumFlySegs();
		int iNonFlyLegs = duty->getNumNonFlySegs();

		bool isAllSegStartInSameDay = true;

		//ISDHDALLOWEDINMIDDLEDUTY,DUTYENDAFTERMIDNIGHTTHREDHOLD,
		//ISDUTYSEGMENTSINSAMECALENDARDAY,ISDEADHEADALLOWBEFOREANDAFTERFOURDAYPAIRING
		int iConsecutiveDhd = 0, iAircaftChanges = 0, iDhdInDuty = 0, idhdTemp = 0, iLT = 0, iGndTransport = 0;
		if (segments.empty())
			continue;
		string tail, fltnum;
		bool isDHDInMiddle = false;
		int firstDhdInMiddleIndex = -1;
		std::string firstDhdInMiddleContext;
		long flyTimeSeconds = 0;
		time_t firstOutOfDaySegStartUtc = 0;
		int firstOutOfDaySegIndex = -1;
		//Segment * firstSeg = duty->getFirstSegment();
		//20180511 ain, mantis#3339, 用 vector编号代替 segSeq计算 dhdIndex/segIndex, 避免PO计算过程中segSeq可能未赋值
		for (std::size_t segIndex = 0; segIndex < duty->getNumSegments(); segIndex++)
		{
			Segment* seg = duty->getSegment(segIndex);
			Segment* next_seg = segIndex+1 >= duty->getNumSegments()? nullptr: duty->getSegment(segIndex+1);

			time_t segstart = seg->getStartTimeUtcAct();
			if (!(seg->getStartTimeUtcAct() >= dayStart && seg->getStartTimeUtcAct() < dayStart + 24 * 3600 + iOverNightFlyThredHoldSec))
			{
				isAllSegStartInSameDay = false;
				if (firstOutOfDaySegIndex < 0) {
					firstOutOfDaySegIndex = static_cast<int>(segIndex);
					firstOutOfDaySegStartUtc = seg->getStartTimeUtcAct();
				}
			}

			if (seg->getIsOperating())
				flyTimeSeconds += seg->getFTTime();

			//if (seg->isLongTransitWithNext() && segIndex < duty->getNumSegments() - 1)
			if (next_seg && RuleParams::GetInstancePtr()->getLongTransit(seg, next_seg) != nullptr)
				iLT++;

			if (seg->getAssignment() == "BUS" || seg->getAssignment() == "TRAIN")
				iGndTransport++;

			tail = seg->getTailNum();
			fltnum = seg->getFlightNumber();
			string assignment = seg->getAssignment();
			if (segIndex > 0 && (seg->getAssignment() == "FLY" || seg->getAssignment() == "DHD"))
			{
				Segment* prevSeg = duty->getSegment(segIndex - 1);
				if (!isSameAircraftForRule2004(prevSeg, seg))
					iAircaftChanges++;
			}

			//if (!(seg->isDeadhead()))
			if (assignment != "DHD")
			{
				if (idhdTemp >= iConsecutiveDhd)
					iConsecutiveDhd = idhdTemp;
				idhdTemp = 0;
			}
			else
			{
				time_t iFT = seg->getFTTime();

				//MAXFLIGHTBLHALLOWDHD
				if (iFT > 60 * hhmmToMinutes(maxFlightBLHAllowDHD.c_str()))
				{
					if (this->_application == PAIRING_OPTIMIZER)
						return false;

					bReturn = false;
					//setLegalityMessage(duty, NULL, singleRule, "FT time of DHD exceeds the limitation(" + maxFlightBLHAllowDHD + ").");
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->pairingId = duty->getPairingId();
					rv->dutySequenceNumber = duty->getDutySeq();
					rv->startDTUtc = duty->getStartTimeUtcAct();
					rv->endDTUtc = duty->getEndTimeUtcAct();
					rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
					rv->idRule = singleRule->idRule;
					rv->ruleParamId = singleRule->idRuleParam;
					rv->violation_msg = buildExceededMsg("The Flight Time of the deadhead segment",
						secondsToHHmm(static_cast<long>(iFT)), maxFlightBLHAllowDHD);
					rv->operation_result.insert(pair<string, string>("ruleId", "2004.4"));
					rv->operation_result.insert(pair<string, string>("maxFlightBLHAllowDHD", maxFlightBLHAllowDHD));
					rv->operation_result.insert(pair<string, string>("actualFlightBLHDeadhead", secondsToHHmm(static_cast<long>(iFT))));
					this->addRuleViolations(rv, singleRule);

				}

				//过站不算连续
				if (segIndex == 0)
					idhdTemp++;
				else{
					if (seg->getFlightNumber() != segments[segIndex - 1]->getFlightNumber())//条件可能不全，需要加上时间差
						idhdTemp++;
				}
				iDhdInDuty++;
				//international DHD not allowed
				if (isInternationalDHDallowed == "N")
				{
					string strRegionType = Utility::GetInstancePtr()->getSegType(&(this->_dbData->airportList), seg->getDepStation(), seg->getArrStation());
					if (strRegionType == "I" || strRegionType == "R")
					{
						if (this->_application == PAIRING_OPTIMIZER)
							return false;

						bReturn = false;
						//setLegalityMessage(duty, NULL, singleRule, "International DHD is not allowed.");
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->pairingId = duty->getPairingId();
						rv->dutySequenceNumber = duty->getDutySeq();
						rv->startDTUtc = duty->getStartTimeUtcAct();
						rv->endDTUtc = duty->getEndTimeUtcAct();
						rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
						rv->idRule = singleRule->idRule;
						rv->ruleParamId = singleRule->idRuleParam;
						rv->violation_msg = "International Deadhead Duties are not permitted (isInternationalDHDallowed=N and this deadhead segment is international: "
							+ seg->getDepStation() + "-" + seg->getArrStation() + ").";
						rv->operation_result.insert(pair<string, string>("ruleId", "2004.5"));
						rv->operation_result.insert(pair<string, string>("isInternationalDHDallowed", isInternationalDHDallowed));
						rv->operation_result.insert(pair<string, string>("deadheadDep", seg->getDepStation()));
						rv->operation_result.insert(pair<string, string>("deadheadArr", seg->getArrStation()));
						this->addRuleViolations(rv, singleRule);

					}
				}

				if (segIndex > 0 && segIndex < segments.size() - 1)
				{
					if (duty->getSegment(segIndex - 1)->getIsOperating() && duty->getSegment(segIndex + 1)->getIsOperating())
					{
						isDHDInMiddle = true;
						if (firstDhdInMiddleIndex < 0) {
							firstDhdInMiddleIndex = static_cast<int>(segIndex);
							Segment* prev = duty->getSegment(segIndex - 1);
							Segment* next = duty->getSegment(segIndex + 1);
							firstDhdInMiddleContext = "prev=" + prev->getDepStation() + "-" + prev->getArrStation()
								+ ", dhd=" + seg->getDepStation() + "-" + seg->getArrStation()
								+ ", next=" + next->getDepStation() + "-" + next->getArrStation();
						}
					}
				}
				if (isDHDMustBetweenBaseAndLOStation == "Y")
				{
					string dep = seg->getDepStation();
					string arr = seg->getArrStation();
					string restrictAll = RuleParams::GetInstancePtr()->restrictAllAirportInLayover;
					vector<string>& bases = RuleParams::GetInstancePtr()->bases;
					vector<string>& noLayovers = RuleParams::GetInstancePtr()->noLayovers;
					vector<string>& allowLayovers = RuleParams::GetInstancePtr()->allowLayovers;

					bool isDepInBases = (find(bases.begin(), bases.end(), dep) != bases.end());
					bool isArrInBases = (find(bases.begin(), bases.end(), arr) != bases.end());

					bool restrictDep = false, restrictArr = false;
					if ((std::find(noLayovers.begin(), noLayovers.end(), dep) != noLayovers.end()) ||
						((std::find(allowLayovers.begin(), allowLayovers.end(), dep) == allowLayovers.end())
						&&
						(restrictAll == "Y")))
						restrictDep = true;
					if ((std::find(noLayovers.begin(), noLayovers.end(), arr) != noLayovers.end()) ||
						((std::find(allowLayovers.begin(), allowLayovers.end(), arr) == allowLayovers.end())
						&&
						(restrictAll == "Y")))
						restrictArr = true;

					if (
						!((isDepInBases && isArrInBases) ||	// dep is base and arr is base, pass
						(isDepInBases && !isArrInBases && !restrictArr) || // dep is base, arr is not base not restricted, pass
						(!isDepInBases && isArrInBases && !restrictDep) || // dep is not base and not restricted, arr is base, pass
						(!isDepInBases && !isArrInBases && !restrictDep && !restrictArr)) // dep is not base and not restricted, arr is not base and not restricted, pass
						)
					{
						if (this->_application == PAIRING_OPTIMIZER)
							return false;

						bReturn = false;
						//setLegalityMessage(duty, NULL, singleRule, "DHD Dep/Arr stations must be within bases or LO stations.");
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->pairingId = duty->getPairingId();
						rv->dutySequenceNumber = duty->getDutySeq();
						rv->startDTUtc = duty->getStartTimeUtcAct();
						rv->endDTUtc = duty->getEndTimeUtcAct();
						rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
						rv->idRule = singleRule->idRule;
						rv->ruleParamId = singleRule->idRuleParam;
						rv->violation_msg = "The departure and arrival stations for Deadhead Duties must be within assigned bases or Line Operations stations (isDHDmustBetweenBaseAndLOStation=Y"
							+ std::string(", dep=") + dep + ", arr=" + arr							
							+ ").";
						rv->operation_result.insert(pair<string, string>("ruleId", "2004.6"));
						rv->operation_result.insert(pair<string, string>("isDHDmustBetweenBaseAndLOStation", isDHDMustBetweenBaseAndLOStation));
						rv->operation_result.insert(pair<string, string>("deadheadDep", dep));
						rv->operation_result.insert(pair<string, string>("deadheadArr", arr));
						this->addRuleViolations(rv, singleRule);

					}
				}

			}
			if (idhdTemp >= iConsecutiveDhd)
				iConsecutiveDhd = idhdTemp;
		}
		//MAXNRAIRCRAFTCHANGSANDLTINDUTY
		if (iAircaftChanges + iLT > stoi(maxNrAircraftchangsAndLTInDuty))
		{
			if (this->_application == PAIRING_OPTIMIZER)
				return false;

			bReturn = false;
			//setLegalityMessage(duty, NULL, singleRule, "Number of aircraft changes and long transit in the duty exceeds the limitation(" + maxNrAircraftchangsAndLTInDuty + ").");
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->pairingId = duty->getPairingId();
			rv->dutySequenceNumber = duty->getDutySeq();
			rv->startDTUtc = duty->getStartTimeUtcAct();
			rv->endDTUtc = duty->getEndTimeUtcAct();
			rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
			rv->idRule = singleRule->idRule;
			rv->ruleParamId = singleRule->idRuleParam;
			rv->violation_msg = buildExceededMsg("The number of aircraft changes and long transits in the duty",
				std::to_string(iAircaftChanges + iLT), maxNrAircraftchangsAndLTInDuty);
			rv->operation_result.insert(pair<string, string>("ruleId", "2004.7"));
			rv->operation_result.insert(pair<string, string>("maxNrAircraftchangsAndLTInDuty", maxNrAircraftchangsAndLTInDuty));
			rv->operation_result.insert(pair<string, string>("actualAircraftChangesAndLTInDuty", std::to_string(iAircaftChanges + iLT)));
			this->addRuleViolations(rv, singleRule);

		}
		//MAXNRAIRCRAFTCHANGEINDUTY
		if (iAircaftChanges > stoi(maxNrAircraftChangeInDuty))
		{
			if (this->_application == PAIRING_OPTIMIZER)
				return false;

			bReturn = false;
			//setLegalityMessage(duty, NULL, singleRule, "Number of aircraft changes in the duty exceeds the limitation(" + maxNrAircraftChangeInDuty + ").");
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->pairingId = duty->getPairingId();
			rv->dutySequenceNumber = duty->getDutySeq();
			rv->startDTUtc = duty->getStartTimeUtcAct();
			rv->endDTUtc = duty->getEndTimeUtcAct();
			rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
			rv->idRule = singleRule->idRule;
			rv->ruleParamId = singleRule->idRuleParam;
			rv->violation_msg = buildExceededMsg("The number of aircraft changes in the duty",
				std::to_string(iAircaftChanges), maxNrAircraftChangeInDuty);
			rv->operation_result.insert(pair<string, string>("ruleId", "2004.8"));
			rv->operation_result.insert(pair<string, string>("maxNrAircraftChangeInDuty", maxNrAircraftChangeInDuty));
			rv->operation_result.insert(pair<string, string>("actualAircraftChangesInDuty", std::to_string(iAircaftChanges)));
			this->addRuleViolations(rv, singleRule);
		}
		if (iAircaftChanges > 0 && duty->getFDPInSecs() > iMaxFdpWithAcChangeInSec)
		{
			if (this->_application == PAIRING_OPTIMIZER)
				return false;

			bReturn = false;
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->pairingId = duty->getPairingId();
			rv->dutySequenceNumber = duty->getDutySeq();
			rv->startDTUtc = duty->getStartTimeUtcAct();
			rv->endDTUtc = duty->getEndTimeUtcAct();
			rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
			rv->idRule = singleRule->idRule;
			rv->ruleParamId = singleRule->idRuleParam;
			rv->violation_msg = buildExceededMsg("The Flight Duty Period with aircraft changes",
				secondsToHHmm(static_cast<long>(duty->getFDPInSecs())), maxFdpWithAircraftChange);
			rv->operation_result.insert(pair<string, string>("ruleId", "2004.18"));
			rv->operation_result.insert(pair<string, string>("maxFdpWithAircraftChange", maxFdpWithAircraftChange));
			rv->operation_result.insert(pair<string, string>("actualFdpWithAircraftChange", secondsToHHmm(static_cast<long>(duty->getFDPInSecs()))));
			this->addRuleViolations(rv, singleRule);
		}
		//MAXNRGRDCOMMUTEINDUTY
		if (iGndTransport > stoi(maxNrGRDCommuteInDuty))
		{
			if (this->_application == PAIRING_OPTIMIZER)
				return false;

			bReturn = false;
			//setLegalityMessage(duty, NULL, singleRule, "Number of ground transportation in the duty exceeds the limitation(" + maxNrGRDCommuteInDuty + ").");
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->pairingId = duty->getPairingId();
			rv->dutySequenceNumber = duty->getDutySeq();
			rv->startDTUtc = duty->getStartTimeUtcAct();
			rv->endDTUtc = duty->getEndTimeUtcAct();
			rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
			rv->idRule = singleRule->idRule;
			rv->ruleParamId = singleRule->idRuleParam;
			rv->violation_msg = buildExceededMsg("The number of ground transportation segments in the duty",
				std::to_string(iGndTransport), maxNrGRDCommuteInDuty);
			rv->operation_result.insert(pair<string, string>("ruleId", "2004.9"));
			rv->operation_result.insert(pair<string, string>("maxNrGRDCommuteInDuty", maxNrGRDCommuteInDuty));
			rv->operation_result.insert(pair<string, string>("actualNrGRDCommuteInDuty", std::to_string(iGndTransport)));
			this->addRuleViolations(rv, singleRule);

		}

		//MAXNRFLYSEGSINDUTY
		if (iFlyLegs > stoi(maxNrFlySegsInDuty))
		{
			if (this->_application == PAIRING_OPTIMIZER)
				return false;

			bReturn = false;
			//setLegalityMessage(duty, NULL, singleRule, "Number of fly segments in the duty exceeds the limitation(" + maxNrFlySegsInDuty + ").");
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->pairingId = duty->getPairingId();
			rv->dutySequenceNumber = duty->getDutySeq();
			rv->startDTUtc = duty->getStartTimeUtcAct();
			rv->endDTUtc = duty->getEndTimeUtcAct();
			rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
			rv->idRule = singleRule->idRule;
			rv->ruleParamId = singleRule->idRuleParam;
			rv->violation_msg = buildExceededMsg("The number of flight segments in the duty",
				std::to_string(iFlyLegs), maxNrFlySegsInDuty);
			rv->operation_result.insert(pair<string, string>("ruleId", "2004.10"));
			rv->operation_result.insert(pair<string, string>("maxNrFlySegsInDuty", maxNrFlySegsInDuty));
			rv->operation_result.insert(pair<string, string>("actualNrFlySegsInDuty", std::to_string(iFlyLegs)));
			this->addRuleViolations(rv, singleRule);

		}

		//MAXNRNONOPERATELEGSINDUTY
		if (iNonFlyLegs > stoi(maxNrNonoperateLegsInDuty))
		{
			if (this->_application == PAIRING_OPTIMIZER)
				return false;

			bReturn = false;
			//setLegalityMessage(duty, NULL, singleRule, "Number of non-fly segments in the duty exceeds the limitation(" + maxNrNonoperateLegsInDuty + ").");
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->pairingId = duty->getPairingId();
			rv->dutySequenceNumber = duty->getDutySeq();
			rv->startDTUtc = duty->getStartTimeUtcAct();
			rv->endDTUtc = duty->getEndTimeUtcAct();
			rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
			rv->idRule = singleRule->idRule;
			rv->ruleParamId = singleRule->idRuleParam;
			rv->violation_msg = buildExceededMsg("The number of non-operational segments in the duty",
				std::to_string(iNonFlyLegs), maxNrNonoperateLegsInDuty);
			rv->operation_result.insert(pair<string, string>("ruleId", "2004.11"));
			rv->operation_result.insert(pair<string, string>("maxNrNonoperateLegsInDuty", maxNrNonoperateLegsInDuty));
			rv->operation_result.insert(pair<string, string>("actualNrNonoperateLegsInDuty", std::to_string(iNonFlyLegs)));
			this->addRuleViolations(rv, singleRule);

		}

		if (flyTimeSeconds > iMaxFlyTimeInSec)
		{
			if (this->_application == PAIRING_OPTIMIZER)
				return false;

			bReturn = false;
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->pairingId = duty->getPairingId();
			rv->dutySequenceNumber = duty->getDutySeq();
			rv->startDTUtc = duty->getStartTimeUtcAct();
			rv->endDTUtc = duty->getEndTimeUtcAct();
			rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
			rv->idRule = singleRule->idRule;
			rv->ruleParamId = singleRule->idRuleParam;
			rv->violation_msg = buildExceededMsg("The total flight time in the duty",
				secondsToHHmm(static_cast<long>(flyTimeSeconds)), maxFlyTimeInDuty);
			rv->operation_result.insert(pair<string, string>("ruleId", "2004.17"));
			rv->operation_result.insert(pair<string, string>("maxFlyTimeInDuty", maxFlyTimeInDuty));
			rv->operation_result.insert(pair<string, string>("actualFlyTimeInDuty", secondsToHHmm(static_cast<long>(flyTimeSeconds))));
			this->addRuleViolations(rv, singleRule);
		}

		//MAXNRCONSECUTIVEDHD
		if (iConsecutiveDhd > stoi(maxNrConsecutiveDhd))
		{
			if (this->_application == PAIRING_OPTIMIZER)
				return false;

			bReturn = false;
			//setLegalityMessage(duty, NULL, singleRule, "The consecutive deadhead in the duty exceeds the limitation(" + maxNrConsecutiveDhd + ").");
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->pairingId = duty->getPairingId();
			rv->dutySequenceNumber = duty->getDutySeq();
			rv->startDTUtc = duty->getStartTimeUtcAct();
			rv->endDTUtc = duty->getEndTimeUtcAct();
			rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
			rv->idRule = singleRule->idRule;
			rv->ruleParamId = singleRule->idRuleParam;
			rv->violation_msg = buildExceededMsg("The number of consecutive deadhead segments",
				std::to_string(iConsecutiveDhd), maxNrConsecutiveDhd);
			rv->operation_result.insert(pair<string, string>("ruleId", "2004.12"));
			rv->operation_result.insert(pair<string, string>("maxNrConsecutiveDhd", maxNrConsecutiveDhd));
			rv->operation_result.insert(pair<string, string>("actualNrConsecutiveDhd", std::to_string(iConsecutiveDhd)));
			this->addRuleViolations(rv, singleRule);

		}

		//MAXNRDHDINDUTY
		if (iDhdInDuty > stoi(maxNrDHDInDuty))
		{
			if (this->_application == PAIRING_OPTIMIZER)
				return false;

			bReturn = false;
			//setLegalityMessage(duty, NULL, singleRule, "The number of deadhead in the duty exceeds the limitation(" + maxNrDHDInDuty + ").");
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->pairingId = duty->getPairingId();
			rv->dutySequenceNumber = duty->getDutySeq();
			rv->startDTUtc = duty->getStartTimeUtcAct();
			rv->endDTUtc = duty->getEndTimeUtcAct();
			rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
			rv->idRule = singleRule->idRule;
			rv->ruleParamId = singleRule->idRuleParam;
			rv->violation_msg = buildExceededMsg("The total number of deadhead segments in the duty",
				std::to_string(iDhdInDuty), maxNrDHDInDuty);
			rv->operation_result.insert(pair<string, string>("ruleId", "2004.13"));
			rv->operation_result.insert(pair<string, string>("maxNrDHDInDuty", maxNrDHDInDuty));
			rv->operation_result.insert(pair<string, string>("actualNrDHDInDuty", std::to_string(iDhdInDuty)));
			this->addRuleViolations(rv, singleRule);

		}

		//ISDHDALLOWEDINMIDDLEDUTY
		//isDhdAllowedInMiddleDuty
		if (isDhdAllowedInMiddleDuty == "N" && isDHDInMiddle)
		{
			if (this->_application == PAIRING_OPTIMIZER)
				return false;

			bReturn = false;
			//setLegalityMessage(duty, NULL, singleRule, "Deadhead is not allowed in the middle of duty.");
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->pairingId = duty->getPairingId();
			rv->dutySequenceNumber = duty->getDutySeq();
			rv->startDTUtc = duty->getStartTimeUtcAct();
			rv->endDTUtc = duty->getEndTimeUtcAct();
			rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
			rv->idRule = singleRule->idRule;
			rv->ruleParamId = singleRule->idRuleParam;
			rv->violation_msg = "Deadhead segments are not permitted in the middle of a duty period (isDhdAllowedInMiddleDuty=N and a deadhead segment is between operating segments"
				+ (firstDhdInMiddleIndex >= 0 ? (", segIndex=" + std::to_string(firstDhdInMiddleIndex) + ", " + firstDhdInMiddleContext) : "") + ").";
			rv->operation_result.insert(pair<string, string>("ruleId", "2004.14"));
			rv->operation_result.insert(pair<string, string>("isDhdAllowedInMiddleDuty", isDhdAllowedInMiddleDuty));
			this->addRuleViolations(rv, singleRule);

		}

		//ISDUTYSEGMENTSINSAMECALENDARDAY
		//isDutySegmentsInSameCalendarDay
		if (!isAllSegStartInSameDay && isDutySegmentsInSameCalendarDay == "Y")
		{
			if (this->_application == PAIRING_OPTIMIZER)
				return false;

			bReturn = false;
			//setLegalityMessage(duty, NULL, singleRule, "All segments in this duty must operate in one day.");
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->pairingId = duty->getPairingId();
			rv->dutySequenceNumber = duty->getDutySeq();
			rv->startDTUtc = duty->getStartTimeUtcAct();
			rv->endDTUtc = duty->getEndTimeUtcAct();
			rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
			rv->idRule = singleRule->idRule;
			rv->ruleParamId = singleRule->idRuleParam;
			{
				std::string window = "windowUtc=[" + utcToUtcString(dayStart) + ","
					+ utcToUtcString(dayStart + 24 * 3600 + iOverNightFlyThredHoldSec) + "]";
				std::string firstOffender = (firstOutOfDaySegIndex >= 0)
					? (", firstOutOfWindowSegStartUtc=" + utcToUtcString(firstOutOfDaySegStartUtc))
					: "";
				rv->violation_msg = "All segments in a duty must start on the same local day as the duty start (isDutySegmentsInSameCalendarDay=Y), with overnight threshold: "
					+ window + firstOffender + ".";
			}
			rv->operation_result.insert(pair<string, string>("ruleId", "2004.15"));
			rv->operation_result.insert(pair<string, string>("isDutySegmentsInSameCalendarDay", isDutySegmentsInSameCalendarDay));
			this->addRuleViolations(rv, singleRule);

		}

		//ISDEADHEADALLOWBEFOREANDAFTERFOURDAYPAIRING
		//isDeadheadAllowBeforeAndAfterFourDayPairing
		//if (iDhdInDuty > stoi(maxNrDHDInDuty)){
		//	bReturn = false;
		//	setLegalityMessage((*it), pPairing, singleRule, "The number of deadhead in the duty exceeds the limitation(%s" + maxNrDHDInDuty + ").");
		//}
	}

	return bReturn;
}

bool LegalityChecker::checkDutyLimitation(vector<Segment *> segments, const DBRule* singleRule, string base)
{
	DBG_HELP("LegalityChecker::checkDutyLimitation_bySegs");
	bool bReturn = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	string strDefinition, strValue;
	//ISDUTYBELONGTODIFFERENTDAYCHECKED, DISCOUNTFACTORFORDHDBLKTIME
	string maxNrFlySegsInDuty, maxNrNonoperateLegsInDuty, maxNrAircraftChangeInDuty;
	string maxNrConsecutiveDhd, maxNrDHDInDuty, isDhdAllowedInMiddleDuty;
	string isDutySegmentsInSameCalendarDay, totalSegsInDuty = "99", isDutyBelongToDifferentDay;
	string isDHDMustBetweenBaseAndLOStation, isInternationalDHDallowed;
	string maxNrGRDCommuteInDuty = "99", maxNrAircraftchangsAndLTInDuty = "99", maxFlightBLHAllowDHD = "999:00";
	string maxFlyTimeInDuty = "999:00", pureDeadheadDutyAllowed = "Y", maxFdpWithAircraftChange = "999:00";
	rule2004* cache = (rule2004*)singleRule->parsedParam.get();
	maxNrFlySegsInDuty = cache->maxNrFlySegsInDuty;
	maxNrNonoperateLegsInDuty = cache->maxNrNonoperateLegsInDuty;
	maxNrAircraftChangeInDuty = cache->maxNrAircraftChangeInDuty;
	maxNrConsecutiveDhd = cache->maxNrConsecutiveDhd;
	maxNrDHDInDuty = cache->maxNrDHDInDuty;
	isDhdAllowedInMiddleDuty = cache->isDhdAllowedInMiddleDuty;
	isDutySegmentsInSameCalendarDay = cache->isDutySegmentsInSameCalendarDay;
	maxNrGRDCommuteInDuty = cache->maxNrGRDCommuteInDuty;
	isDutyBelongToDifferentDay = cache->isDutyBelongToDifferentDayChecked;
	maxNrAircraftchangsAndLTInDuty = cache->maxNrAircraftchangsAndLTInDuty;
	isDHDMustBetweenBaseAndLOStation = cache->isDHDmustBetweenBaseAndLOStation;
	totalSegsInDuty = cache->totalSegsInDuty;
	maxFlightBLHAllowDHD = cache->maxFlightBLHAllowDHD;
	isInternationalDHDallowed = cache->isInternationalDHDallowed;
	maxFlyTimeInDuty = cache->maxFlyTimeInDuty;
	pureDeadheadDutyAllowed = cache->pureDeadheadDutyAllowed;
	maxFdpWithAircraftChange = cache->maxFdpWithAircraftChange;

	//mantis#3610, ruleParam.value检查
	if (totalSegsInDuty.empty()) {
		Logger::getRuleLogger()->error("ERROR: invalid data, paramName='totalSegsInDuty' not found in rule 2004\n");
		return false;
	}

	if ((int)segments.size() <= 0)
	{
		bReturn = false;
		if (this->_application == PAIRING_OPTIMIZER)
			return bReturn;
	}

	bool isAllDutiesInDifferentDay = true;
	string base1;
	if (base != "")
		base1 = base;
	else if (base1 == "")
		base1 = segments[0]->getDepStation();

	//TOTALSEGSINDUTY
	if ((int)segments.size() > stoi(totalSegsInDuty))
	{
		bReturn = false;
		if (this->_application == PAIRING_OPTIMIZER)
			return bReturn;
	}

	if (pureDeadheadDutyAllowed == "N")
	{
		bool isPureDeadheadDuty = !segments.empty();
		for (auto seg : segments) {
			if (seg->getAssignment() != "DHD") {
				isPureDeadheadDuty = false;
				break;
			}
		}
		if (isPureDeadheadDuty) {
			if (this->_application == PAIRING_OPTIMIZER)
				return bReturn;
			bReturn = false;
		}
	}

	int iMaxFlyTimeInSec = 999 * 3600;
	if (!maxFlyTimeInDuty.empty() && maxFlyTimeInDuty != "*")
		iMaxFlyTimeInSec = hhmmToMinutes(maxFlyTimeInDuty.c_str()) * 60;

	int iFlyLegs = 0, iDhdLegs = 0, iGndTransport = 0, iConsecutiveDhd = 0, idhdTemp = 0, iAircaftChanges = 0, iLT = 0;
	long flyTimeSeconds = 0;
	string tail, fltnum;
	//与下面重复，下面过程计算
	//for (std::size_t segIndex = 0; segIndex < segments.size(); segIndex++)
	//{
	//	Segment* seg = segments[segIndex];
	//	if (seg->isLongTransitWithNext() && segIndex <  segments.size() - 1)
	//		iLT++;

	//	tail = seg->getTailNum();
	//	fltnum = seg->getFlightNumber();
	//	string assignment = seg->getAssignment();
	//	if (segIndex > 0 && seg->getIsOperating())
	//	{
	//		if ((tail != strPrevTail) && tail.length() > 0 && strPrevTail.length() > 0)
	//		{
	//			if ((nextNum != fltnum) && (nextNum.length() > 0)){
	//				//FERRY+FLY/FLY+FERRY Is Not ACChang  modified by ZZM
	//				Segment* prevSeg = segments[segIndex - 1];
	//				if ((prevSeg->getAssignment() == "FLY" || prevSeg->getAssignment() == "DHD")
	//					&& (seg->getAssignment() == "FLY" || seg->getAssignment() == "DHD"))
	//					iAircaftChanges++;
	//			}
	//		}
	//	}
	//	if(seg->getIsOperating())
	//	{
	//		nextNum = seg->getNextLegNo();
	//		strPrevTail = tail;
	//	}
	//}

	//2004重算isLongTransit字段，保证PO中Segment出现在多条Path中的可能性和UI中改变当前Duty结构所引发的Bug
	//RuleParams::GetInstancePtr()->getAndSetLongTransitRest(segments);

	for (std::size_t i = 0; i < segments.size();i ++)
	{
		Segment* seg = segments[i];
		if (seg->getAssignment() != "DHD")
		{
			if (seg->getIsOperating())
				iFlyLegs++;
			if (seg->getIsOperating())
				flyTimeSeconds += seg->getFTTime();

			if (idhdTemp >= iConsecutiveDhd)
				iConsecutiveDhd = idhdTemp;
			idhdTemp = 0;
		}
		if (seg->isDeadhead())//当前seg为DHD时
		{
			if (isInternationalDHDallowed == "N")
			{
				string strRegionType = Utility::GetInstancePtr()->getSegType(&(this->_dbData->airportList), seg->getDepStation(), seg->getArrStation());
				if (strRegionType == "I")
				{
					bReturn = false;
					if (this->_application == PAIRING_OPTIMIZER)
						return bReturn;
				}
			}

			int iFT = seg->getFTTime();
			//MAXFLIGHTBLHALLOWDHD
			if (iFT > 60 * hhmmToMinutes(maxFlightBLHAllowDHD.c_str()))
			{
				bReturn = false;
				if (this->_application == PAIRING_OPTIMIZER)
					return bReturn;
			}

			//ISDHDMUSTBETWEENBASEANDLOSTATION
			if (isDHDMustBetweenBaseAndLOStation == "Y")
			{
				string dep = seg->getDepStation();
				string arr = seg->getArrStation();
				string restrictAll = RuleParams::GetInstancePtr()->restrictAllAirportInLayover;
				vector<string>& bases = RuleParams::GetInstancePtr()->bases;
				vector<string>& noLayovers = RuleParams::GetInstancePtr()->noLayovers;
				vector<string>& allowLayovers = RuleParams::GetInstancePtr()->allowLayovers;

				bool isDepInBases = (find(bases.begin(), bases.end(), dep) != bases.end());
				bool isArrInBases = (find(bases.begin(), bases.end(), arr) != bases.end());

				bool restrictDep = false, restrictArr = false;
				if ((std::find(noLayovers.begin(), noLayovers.end(), dep) != noLayovers.end()) ||
					((std::find(allowLayovers.begin(), allowLayovers.end(), dep) == allowLayovers.end())
					&&
					(restrictAll == "Y")))
					restrictDep = true;
				if ((std::find(noLayovers.begin(), noLayovers.end(), arr) != noLayovers.end()) ||
					((std::find(allowLayovers.begin(), allowLayovers.end(), arr) == allowLayovers.end())
					&&
					(restrictAll == "Y")))
					restrictArr = true;

				if (
					!((isDepInBases && isArrInBases) ||
					(isDepInBases && !isArrInBases && !restrictArr) ||
					(!isDepInBases && isArrInBases && !restrictDep) ||
					(!isDepInBases && !isArrInBases && !restrictDep && !restrictArr))
					)
				{
					bReturn = false;
					if (this->_application == PAIRING_OPTIMIZER)
						return bReturn;
				}
			}
			//过站不算连续
			if (i == 0)
				idhdTemp++;
			else{
				if (seg->getFlightNumber() != segments[i - 1]->getFlightNumber())//条件可能不全，需要加上时间差
					idhdTemp++;
			}
			iDhdLegs++;
		}
		if (idhdTemp >= iConsecutiveDhd)
			iConsecutiveDhd = idhdTemp;
		if (seg->getAssignment() == "BUS" || seg->getAssignment() == "TRAIN")
			iGndTransport++;

		Segment* next_seg = i + 1 >= segments.size() ? nullptr : segments[i + 1];
		//if (seg->isLongTransitWithNext() && i < segments.size())
		if (next_seg && RuleParams::GetInstancePtr()->getLongTransit(seg, next_seg) != nullptr)
		{
			// 20220510 Duan Peng 如果long transit的后一段全是置位，则不记入长中转long transit次数
			bool isSecondDHD = true;
			for (std::size_t ss = i + 1; ss < segments.size(); ss++) {
				auto seg = segments[ss];
				if (seg->getIsOperating()) {
					isSecondDHD = false;
					break;
				}
			}
			if (!isSecondDHD)
				iLT++;
		}

		//nextNum strPrevTail未赋值
		/*string nextNum, strPrevTail;
		string tail = seg->getTailNum();
		string fltnum = seg->getFlightNumber();
		string assignment = seg->getAssignment();*/

		tail = seg->getTailNum();
		fltnum = seg->getFlightNumber();
		if (i > 0 && (seg->getAssignment() == "FLY" || seg->getAssignment() == "DHD"))
		{
			Segment* prevSeg = segments[i - 1];
			if (!isSameAircraftForRule2004(prevSeg, seg))
				iAircaftChanges++;
		}

	}
	if (iAircaftChanges + iLT > stoi(maxNrAircraftchangsAndLTInDuty)){
		bReturn = false;
		if (this->_application == PAIRING_OPTIMIZER)
			return bReturn;
	}
	if (iFlyLegs > stoi(maxNrFlySegsInDuty))
	{
		bReturn = false;
		if (this->_application == PAIRING_OPTIMIZER)
			return bReturn;
	}
	if (iDhdLegs > stoi(maxNrDHDInDuty))
	{
		bReturn = false;
		if (this->_application == PAIRING_OPTIMIZER)
			return bReturn;
	}
	if (iGndTransport > stoi(maxNrGRDCommuteInDuty))
	{
		bReturn = false;
		if (this->_application == PAIRING_OPTIMIZER)
			return bReturn;
	}
	if (flyTimeSeconds > iMaxFlyTimeInSec)
	{
		bReturn = false;
		if (this->_application == PAIRING_OPTIMIZER)
			return bReturn;
	}
	//MAXNRCONSECUTIVEDHD
	if (iConsecutiveDhd > stoi(maxNrConsecutiveDhd))
	{
		bReturn = false;
		if (this->_application == PAIRING_OPTIMIZER)
			return bReturn;
	}
	if (iAircaftChanges > stoi(maxNrAircraftChangeInDuty))
	{
		bReturn = false;
		if (this->_application == PAIRING_OPTIMIZER)
			return bReturn;
	}

	//上面已经判断过了
	/*if (iAircaftChanges + iLT > stoi(maxNrAircraftchangsAndLTInDuty))
	{
		bReturn = false;
		if (this->_application == PAIRING_OPTIMIZER)
			return bReturn;
	}*/

	return bReturn;
}


bool LegalityChecker::checkDutyLimitation(RULE_LEGALITY * pPairing, const DBRule* singleRule)
{
	//20180914 ain, mantis#4058, 因2004可能在 checkCrew中调用，增加判断 pairingIndex=-1
	if (pPairing->PairingIndex == -1) {
		return true;
	}
	Pairing * pg = this->_dbData->pairingList[pPairing->PairingIndex];
	bool bReturn = true;
	if (pg)
	{
		string base = pg->getBase();
		vector<Duty*> duties = pg->getDutyVec();
		bReturn = checkDutyLimitation(duties, singleRule, base);
	}
	return bReturn;
}
int LegalityChecker::getDutyLongTransitNumber(Duty* duty){
	DBG_HELP("LegalityChecker::getDutyLongTransitNumber");
	vector<Segment*> segments = duty->getSegments();
	return getSegmentsLongTransitNumber(segments);
	

}
int LegalityChecker::getDutyAircraftChangeNumber(Duty* duty){
	DBG_HELP("LegalityChecker::getDutyAircraftChangeNumber");
	vector<Segment*> segments = duty->getSegments();
	return getSegmentsAircraftChangeNumber(segments);
	
}
int LegalityChecker::getSegmentsLongTransitNumber(vector<Segment *>& segments) {
	if ((int)segments.size() <= 0)
	{
		return 0;
	}

	int iLT = 0;
	for (std::size_t segIndex = 0; segIndex < segments.size(); segIndex++)
	{
		Segment* seg = segments[segIndex];
		Segment* next_seg = segIndex + 1 >= segments.size() ? nullptr : segments[segIndex + 1];
		//if (seg->isLongTransitWithNext() && segIndex < segments.size() - 1)
		if (next_seg && RuleParams::GetInstancePtr()->getLongTransit(seg, next_seg) != nullptr)
			iLT++;
	}
	return iLT;
}
int LegalityChecker::getSegmentsAircraftChangeNumber(vector<Segment *>& segments) {
	if ((int)segments.size() <= 0)
	{
		return 0;
	}

	int iAircaftChanges = 0;
	string tail, fltnum;
	for (std::size_t segIndex = 0; segIndex < segments.size(); segIndex++)
	{
		Segment* seg = segments[segIndex];
		tail = seg->getTailNum();
		fltnum = seg->getFlightNumber();
		if (segIndex > 0 && (seg->getAssignment() == "FLY" || seg->getAssignment() == "DHD"))
		{
			Segment* prevSeg = segments[segIndex - 1];
			if (!isSameAircraftForRule2004(prevSeg, seg))
				iAircaftChanges++;
		}
	}
	return iAircaftChanges;
}
int LegalityChecker::getSegmentsLongTransitTime(vector<Segment *>& segments){
	int LTTime = 0;
	LTTime += RuleParams::GetInstancePtr()->getLongTransitRest(segments);
	return LTTime;
}
