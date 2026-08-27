#include "WorkPeriod.h"

#include <algorithm>
#include "Duty.h"
#include "RuleParams.h"
#include "../utils/AssignmentUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "../utils/SchDutyUtils.h"

std::string GetWorkTypeEnumName(const WorkType workType) {
	if (workType == WorkType::GroundRoster) {
		return "Ground";
	}
	if (workType == WorkType::FltDuty) {
		return "Duty";
	}
	return "NA";
}

std::vector<std::unique_ptr<WorkPeriod>> WorkPeriod::GetWorkPeriods(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CrewDataContext>& dbData) {
	std::vector<std::unique_ptr<WorkPeriod>> workPeriods;
	for (std::vector<const ROSTER*>::const_iterator rosterIter2 = rosters.begin(); rosterIter2 != rosters.end(); ++rosterIter2)
	{
		const ROSTER* roster = *rosterIter2;
		Pairing *pg = roster->pairing;

		//休息类任务忽略掉
		if (RuleParams::GetInstancePtr()->isRestAssignment(roster->qualifier, roster->duty))
			continue;
		//休假任务忽略掉
		if (AssignmentUtils::IsLeaveAssignment(roster->duty))
			continue;

		if (pg == nullptr)
		{
			//地面任务工作时间
			std::unique_ptr<WorkPeriod> workPeriod = std::make_unique<WorkPeriod>();
			workPeriod->SetWorkType(WorkType::GroundRoster);
			workPeriod->SetKey(StringUtils::lltos(roster->rosterId));
			workPeriod->SetWork(roster);
			workPeriod->SetRoster(roster);
			workPeriod->SetStartTimeUTC(roster->actStrUtc);
			workPeriod->SetEndTimeUTC(roster->actRestStrUtc);
			workPeriod->SetStartTimeLoc(roster->actStrLoc);
			workPeriod->SetEndTimeLoc(roster->actRestStrLoc);
			workPeriod->SetStartStation(roster->location);
			workPeriod->SetEndStation(roster->location);

			//work->endUtcTime = (*ix)->actRestStrUtc;
			//work->needRuleCheck = (*ix)->needRuleCheck;
			if (roster->source == "PA") {
				workPeriod->SetSource(RosterSource::PA);
			}
			workPeriods.push_back(std::move(workPeriod));
			continue;
		}

		//TODO ????
		CalculationManday REST = dbData->getCalculationManday("RESTGAP");

		const vector<Duty*> dutys = pg->getDutyVec();
		for (std::vector<Duty*>::const_iterator dutyIter2 = dutys.begin(); dutyIter2 != dutys.end(); ++dutyIter2) {
			const Duty* duty = *dutyIter2;
			Duty::DUTY_TYPE dutyType = duty->getType();
			if ((dutyType != Duty::DUTY_PAIRING_REST) && (dutyType != Duty::DUTY_BLANK_DAY))
			{
				std::unique_ptr<WorkPeriod> workPeriod = std::make_unique<WorkPeriod>();
				workPeriod->SetWorkType(WorkType::FltDuty);
				workPeriod->SetKey(StringUtils::lltos(duty->getDutyId()));
				workPeriod->SetWork(duty);
				workPeriod->SetRoster(roster);
				workPeriod->SetStartTimeUTC(duty->getStartTimeUtc(REST.str) - duty->getActualPickupMin() * 60);
				workPeriod->SetEndTimeUTC(duty->getEndTimeUtc(REST.end) + duty->getActualDropoffMin() * 60);

				workPeriod->SetStartTimeLoc(duty->getStartTimeLoc(REST.str) - duty->getActualPickupMin() * 60);
				workPeriod->SetEndTimeLoc(duty->getEndTimeLoc(REST.end) + duty->getActualDropoffMin() * 60);

				workPeriod->SetStartStation(duty->getDepStationRead());
				workPeriod->SetEndStation(duty->getArrStationRead());

				workPeriod->SetAccTimezoneAtStart(duty->getRefTimeZone());

				//work->needRuleCheck = roster->needRuleCheck;

				if (roster->source == "PA") {
					workPeriod->SetSource(RosterSource::PA);
				}
				workPeriods.push_back(std::move(workPeriod));
			}
		}
	}

	//按开始时间排序
	std::stable_sort(workPeriods.begin(), workPeriods.end(),
		[](const std::unique_ptr<WorkPeriod>& src, const std::unique_ptr<WorkPeriod>& dest)->int {
		return src->GetStartTimeUTC() < dest->GetStartTimeUTC();
	}
	);
	return std::move(workPeriods);
}

std::vector<std::unique_ptr<WorkPeriod>> WorkPeriod::GetWorkPeriods(const std::vector<const ROSTER*>& rosters, const std::vector<std::string>& workingAssignmentGroups, const std::shared_ptr<CrewDataContext>& dbData) {
	std::vector<std::unique_ptr<WorkPeriod>> workPeriods;
	
	for (auto& roster : rosters)
	{
		string rosterAsnment = roster->qualifier;
		Pairing* pg = roster->pairing;
		
		if (pg == nullptr)
		{
			if (!workingAssignmentGroups.empty() && !dbData->isAssignmentInGroup(roster->qualifier, workingAssignmentGroups)) {
				continue;
			}
			//地面任务工作时间
			std::unique_ptr<WorkPeriod> workPeriod = std::make_unique<WorkPeriod>();
			workPeriod->SetWorkType(WorkType::GroundRoster);
			workPeriod->SetKey(StringUtils::lltos(roster->rosterId));
			workPeriod->SetWork(roster);
			workPeriod->SetRoster(roster);
			workPeriod->SetStartTimeUTC(roster->actStrUtc);
			workPeriod->SetEndTimeUTC(roster->actRestStrUtc);
			workPeriod->SetStartTimeLoc(roster->actStrLoc);
			workPeriod->SetEndTimeLoc(roster->actRestStrLoc);
			workPeriod->SetStartStation(roster->location);
			workPeriod->SetEndStation(roster->location);

			//work->endUtcTime = (*ix)->actRestStrUtc;
			//work->needRuleCheck = (*ix)->needRuleCheck;
			if (roster->source == "PA") {
				workPeriod->SetSource(RosterSource::PA);
			}
			workPeriods.push_back(std::move(workPeriod));
			continue;
		}

		CalculationManday REST = dbData->getCalculationManday("RESTGAP");

		const vector<Duty*> dutys = pg->getDutyVec();
		for (auto& duty : dutys) {
			if (workingAssignmentGroups.empty() || dbData->isAssignmentInGroup(duty->getAssignment(), workingAssignmentGroups))
			{
				std::unique_ptr<WorkPeriod> workPeriod = std::make_unique<WorkPeriod>();
				workPeriod->SetWorkType(WorkType::FltDuty);
				workPeriod->SetKey(StringUtils::lltos(duty->getDutyId()));
				workPeriod->SetWork(duty);
				workPeriod->SetRoster(roster);
				workPeriod->SetStartTimeUTC(duty->getStartTimeUtc(REST.str) - duty->getActualPickupMin() * 60);
				workPeriod->SetEndTimeUTC(duty->getEndTimeUtc(REST.end) + duty->getActualDropoffMin() * 60);

				workPeriod->SetStartTimeLoc(duty->getStartTimeLoc(REST.str) - duty->getActualPickupMin() * 60);
				workPeriod->SetEndTimeLoc(duty->getEndTimeLoc(REST.end) + duty->getActualDropoffMin() * 60);

				workPeriod->SetStartStation(duty->getDepStationRead());
				workPeriod->SetEndStation(duty->getArrStationRead());

				//work->needRuleCheck = roster->needRuleCheck;

				if (roster->source == "PA") {
					workPeriod->SetSource(RosterSource::PA);
				}
				workPeriods.push_back(std::move(workPeriod));
			}
		}
	}

	//按开始时间排序
	std::stable_sort(workPeriods.begin(), workPeriods.end(),
		[](const std::unique_ptr<WorkPeriod>& src, const std::unique_ptr<WorkPeriod>& dest)->int {
			return src->GetStartTimeUTC() < dest->GetStartTimeUTC();
		}
	);
	return std::move(workPeriods);
}

void WorkPeriod::AppendBlankDaysToWorkPeriods(std::vector<std::unique_ptr<WorkPeriod>>& workPeriods, const int offsetTZMinutes) {
	//当空白天作为工作日，此处填充空白天为工作日
	for (size_t i = 0; i < workPeriods.size() - 1; i++) {
		auto& currentWorkPeriod = workPeriods.at(i);
		auto& nextWorkPeriod = workPeriods.at(i + 1);
		time_t restStartTimeUtc = currentWorkPeriod->GetEndTimeUTC();
		time_t restEndTimeUtc = nextWorkPeriod->GetStartTimeUTC();
		
		time_t blankDayStartTimeUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(restStartTimeUtc, offsetTZMinutes) + (time_t)24 * 3600;
		time_t blankDayEndTimeUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(restEndTimeUtc, offsetTZMinutes);
		if (blankDayEndTimeUtc > blankDayStartTimeUtc) {
			//存在空白天(这里可能是n天)，计入工作日
			std::unique_ptr<WorkPeriod> workPeriod = std::make_unique<WorkPeriod>();
			workPeriod->SetWorkType(WorkType::BlankDay);
			workPeriod->SetKey("-1");
			workPeriod->SetWork(nullptr);
			workPeriod->SetRoster(nullptr);
			workPeriod->SetStartTimeUTC(blankDayStartTimeUtc);
			workPeriod->SetEndTimeUTC(blankDayEndTimeUtc);

			workPeriod->SetStartTimeLoc(blankDayStartTimeUtc + (time_t)offsetTZMinutes * 60);
			workPeriod->SetEndTimeLoc(blankDayEndTimeUtc + (time_t)offsetTZMinutes * 60);

			workPeriod->SetStartStation(currentWorkPeriod->GetEndStation());
			workPeriod->SetEndStation(currentWorkPeriod->GetEndStation());
			workPeriods.push_back(std::move(workPeriod));
		}
	}

	//按开始时间排序
	std::stable_sort(workPeriods.begin(), workPeriods.end(),
		[](const std::unique_ptr<WorkPeriod>& src, const std::unique_ptr<WorkPeriod>& dest)->int {
			return src->GetStartTimeUTC() < dest->GetStartTimeUTC();
		}
	);
}

std::vector<std::unique_ptr<WorkPeriod>> WorkPeriod::GetWorkPeriods(const Pairing* pairing, const std::vector<std::string>& workingAssignmentGroups, const std::shared_ptr<CrewDataContext>& dbData) {
	std::vector<std::unique_ptr<WorkPeriod>> workPeriods;
	if (pairing == nullptr) {
		return std::move(workPeriods);
	}

	CalculationManday REST = dbData->getCalculationManday("RESTGAP");

	const vector<Duty*> dutys = pairing->getDutyVec();
	for (auto& duty :  dutys) {
		if (workingAssignmentGroups.empty() || dbData->isAssignmentInGroup(duty->getAssignment(), workingAssignmentGroups))
		{
			std::unique_ptr<WorkPeriod> workPeriod = std::make_unique<WorkPeriod>();
			workPeriod->SetWorkType(WorkType::FltDuty);
			workPeriod->SetKey(StringUtils::lltos(duty->getDutyId()));
			workPeriod->SetWork(duty);
			workPeriod->SetRoster(nullptr);
			workPeriod->SetStartTimeUTC(duty->getStartTimeUtc(REST.str) - duty->getActualPickupMin() * 60);
			workPeriod->SetEndTimeUTC(duty->getEndTimeUtc(REST.end) + duty->getActualDropoffMin() * 60);

			workPeriod->SetStartTimeLoc(duty->getStartTimeLoc(REST.str) - duty->getActualPickupMin() * 60);
			workPeriod->SetEndTimeLoc(duty->getEndTimeLoc(REST.end) + duty->getActualDropoffMin() * 60);

			workPeriod->SetStartStation(duty->getDepStationRead());
			workPeriod->SetEndStation(duty->getArrStationRead());

			//work->needRuleCheck = roster->needRuleCheck;

			workPeriods.push_back(std::move(workPeriod));
		}
	}

	//按开始时间排序
	std::stable_sort(workPeriods.begin(), workPeriods.end(),
		[](const std::unique_ptr<WorkPeriod>& src, const std::unique_ptr<WorkPeriod>& dest)->int {
			return src->GetStartTimeUTC() < dest->GetStartTimeUTC();
		}
	);
	return std::move(workPeriods);
}

std::vector<std::unique_ptr<WorkPeriod>> WorkPeriod::GetWorkPeriods2(const std::vector<const ROSTER*>& rosters, const std::vector<std::string>& restAssignmentGroups,
	const std::shared_ptr<CrewDataContext>& dbData) {
	std::vector<std::unique_ptr<WorkPeriod>> workPeriods;
	for (std::vector<const ROSTER*>::const_iterator rosterIter2 = rosters.begin(); rosterIter2 != rosters.end(); ++rosterIter2)
	{
		const ROSTER* roster = *rosterIter2;
		Pairing* pg = roster->pairing;

		//忽略休息任务组
		if (!restAssignmentGroups.empty() && dbData->isAssignmentInGroup(roster->qualifier, restAssignmentGroups))
		{
			continue;
		}

		if (pg == nullptr)
		{
			//地面任务工作时间
			std::unique_ptr<WorkPeriod> workPeriod = std::make_unique<WorkPeriod>();
			workPeriod->SetWorkType(WorkType::GroundRoster);
			workPeriod->SetKey(StringUtils::lltos(roster->rosterId));
			workPeriod->SetWork(roster);
			workPeriod->SetRoster(roster);
			workPeriod->SetStartTimeUTC(roster->actStrUtc);
			workPeriod->SetEndTimeUTC(roster->actRestStrUtc);
			workPeriod->SetStartTimeLoc(roster->actStrLoc);
			workPeriod->SetEndTimeLoc(roster->actRestStrLoc);
			workPeriod->SetStartStation(roster->location);
			workPeriod->SetEndStation(roster->location);

			//work->endUtcTime = (*ix)->actRestStrUtc;
			//work->needRuleCheck = (*ix)->needRuleCheck;
			if (roster->source == "PA") {
				workPeriod->SetSource(RosterSource::PA);
			}
			workPeriods.push_back(std::move(workPeriod));
			continue;
		}

		//TODO ????
		CalculationManday REST = dbData->getCalculationManday("RESTGAP");

		const vector<Duty*> dutys = pg->getDutyVec();
		for (std::vector<Duty*>::const_iterator dutyIter2 = dutys.begin(); dutyIter2 != dutys.end(); ++dutyIter2) {
			const Duty* duty = *dutyIter2;
			Duty::DUTY_TYPE dutyType = duty->getType();
			if ((dutyType != Duty::DUTY_PAIRING_REST) && (dutyType != Duty::DUTY_BLANK_DAY))
			{
				std::unique_ptr<WorkPeriod> workPeriod = std::make_unique<WorkPeriod>();
				workPeriod->SetWorkType(WorkType::FltDuty);
				workPeriod->SetKey(StringUtils::lltos(duty->getDutyId()));
				workPeriod->SetWork(duty);
				workPeriod->SetRoster(roster);
				workPeriod->SetStartTimeUTC(duty->getStartTimeUtc(REST.str) - duty->getActualPickupMin() * 60);
				workPeriod->SetEndTimeUTC(duty->getEndTimeUtc(REST.end) + duty->getActualDropoffMin() * 60);

				workPeriod->SetStartTimeLoc(duty->getStartTimeLoc(REST.str) - duty->getActualPickupMin() * 60);
				workPeriod->SetEndTimeLoc(duty->getEndTimeLoc(REST.end) + duty->getActualDropoffMin() * 60);

				workPeriod->SetStartStation(duty->getDepStationRead());
				workPeriod->SetEndStation(duty->getArrStationRead());

				//work->needRuleCheck = roster->needRuleCheck;

				if (roster->source == "PA") {
					workPeriod->SetSource(RosterSource::PA);
				}
				workPeriods.push_back(std::move(workPeriod));
			}
		}
	}

	//按开始时间排序
	std::stable_sort(workPeriods.begin(), workPeriods.end(),
		[](const std::unique_ptr<WorkPeriod>& src, const std::unique_ptr<WorkPeriod>& dest)->int {
			return src->GetStartTimeUTC() < dest->GetStartTimeUTC();
		}
	);
	return std::move(workPeriods);
}

std::vector<std::unique_ptr<WorkPeriod>> WorkPeriod::GetWorkFDPPeriods(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CrewDataContext>& dbData) {
	std::vector<std::unique_ptr<WorkPeriod>> workPeriods;
	for (std::vector<const ROSTER*>::const_iterator rosterIter2 = rosters.begin(); rosterIter2 != rosters.end(); ++rosterIter2)
	{
		const ROSTER* roster = *rosterIter2;
		string rosterAsnment = roster->duty;
		Pairing* pg = roster->pairing;

		//休息类任务忽略掉
		if (RuleParams::GetInstancePtr()->isRestAssignment(roster->qualifier, roster->duty))
			continue;
		//休假任务忽略掉
		if (AssignmentUtils::IsLeaveAssignment(rosterAsnment))
			continue;

		if (pg == nullptr)
		{
			//地面任务工作时间
			std::unique_ptr<WorkPeriod> workPeriod = std::make_unique<WorkPeriod>();
			workPeriod->SetWorkType(WorkType::GroundRoster);
			workPeriod->SetKey(StringUtils::lltos(roster->rosterId));
			workPeriod->SetWork(roster);
			workPeriod->SetRoster(roster);
			workPeriod->SetStartTimeUTC(roster->actStrUtc);
			workPeriod->SetEndTimeUTC(roster->actRestStrUtc);
			workPeriod->SetStartTimeLoc(roster->actStrLoc);
			workPeriod->SetEndTimeLoc(roster->actRestStrLoc);
			workPeriod->SetStartStation(roster->location);
			workPeriod->SetEndStation(roster->location);

			//work->endUtcTime = (*ix)->actRestStrUtc;
			//work->needRuleCheck = (*ix)->needRuleCheck;
			if (roster->source == "PA") {
				workPeriod->SetSource(RosterSource::PA);
			}
			workPeriods.push_back(std::move(workPeriod));
			continue;
		}

		//TODO ????
		CalculationManday REST = dbData->getCalculationManday("RESTGAP");

		const vector<Duty*> dutys = pg->getDutyVec();
		for (std::vector<Duty*>::const_iterator dutyIter2 = dutys.begin(); dutyIter2 != dutys.end(); ++dutyIter2) {
			const Duty* duty = *dutyIter2;
			Duty::DUTY_TYPE dutyType = duty->getType();
			if ((dutyType != Duty::DUTY_PAIRING_REST) && (dutyType != Duty::DUTY_BLANK_DAY))
			{
				std::unique_ptr<WorkPeriod> workPeriod = std::make_unique<WorkPeriod>();
				workPeriod->SetWorkType(WorkType::FltDuty);
				workPeriod->SetKey(StringUtils::lltos(duty->getDutyId()));
				workPeriod->SetWork(duty);
				workPeriod->SetRoster(roster);
				workPeriod->SetStartTimeUTC(duty->getStartTimeUtc(REST.str) - duty->getActualPickupMin() * 60);
				workPeriod->SetEndTimeUTC(duty->getEndTimeUtc(REST.end) + duty->getActualDropoffMin() * 60);

				workPeriod->SetStartTimeLoc(duty->getStartTimeLoc(REST.str) - duty->getActualPickupMin() * 60);
				workPeriod->SetEndTimeLoc(duty->getEndTimeLoc(REST.end) + duty->getActualDropoffMin() * 60);
				workPeriod->SetFDPStartTimeUTC(duty->getFDPStartUtcTimes());
				workPeriod->SetFDPEndTimeUTC(duty->getFDPEndUtcTimes());

				workPeriod->SetStartStation(duty->getDepartureStation());
				workPeriod->SetEndStation(duty->getArrivalStation());

				//work->needRuleCheck = roster->needRuleCheck;

				if (roster->source == "PA") {
					workPeriod->SetSource(RosterSource::PA);
				}
				workPeriods.push_back(std::move(workPeriod));
			}
		}
	}

	//按开始时间排序
	std::stable_sort(workPeriods.begin(), workPeriods.end(),
		[](const std::unique_ptr<WorkPeriod>& src, const std::unique_ptr<WorkPeriod>& dest)->int {
			return src->GetStartTimeUTC() < dest->GetStartTimeUTC();
		}
	);
	return std::move(workPeriods);
}

std::vector<std::unique_ptr<WorkPeriod>> WorkPeriod::GetWorkPeriodsBySch(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CrewDataContext>& dbData) {
	std::vector<std::unique_ptr<WorkPeriod>> workPeriods;
	for (std::vector<const ROSTER*>::const_iterator rosterIter2 = rosters.begin(); rosterIter2 != rosters.end(); ++rosterIter2)
	{
		const ROSTER* roster = *rosterIter2;
		string rosterAsnment = roster->qualifier;
		Pairing* pg = roster->pairing;

		//休息类任务忽略掉
		if (RuleParams::GetInstancePtr()->isRestAssignment(roster->qualifier, roster->duty))
			continue;
		//休假任务忽略掉
		if (AssignmentUtils::IsLeaveAssignment(roster->duty))
			continue;

		if (pg == nullptr)
		{
			//地面任务工作时间
			std::unique_ptr<WorkPeriod> workPeriod = std::make_unique<WorkPeriod>();
			workPeriod->SetWorkType(WorkType::GroundRoster);
			workPeriod->SetKey(StringUtils::lltos(roster->rosterId));
			workPeriod->SetWork(roster);
			workPeriod->SetRoster(roster);
			workPeriod->SetStartTimeUTC(roster->actStrUtc);
			workPeriod->SetEndTimeUTC(roster->actRestStrUtc);
			workPeriod->SetStartTimeLoc(roster->actStrLoc);
			workPeriod->SetEndTimeLoc(roster->actRestStrLoc);

			//work->endUtcTime = (*ix)->actRestStrUtc;
			//work->needRuleCheck = (*ix)->needRuleCheck;
			if (roster->source == "PA") {
				workPeriod->SetSource(RosterSource::PA);
			}
			workPeriods.push_back(std::move(workPeriod));
			continue;
		}

		const vector<Duty*> dutys = pg->getDutyVec();
		for (std::vector<Duty*>::const_iterator dutyIter2 = dutys.begin(); dutyIter2 != dutys.end(); ++dutyIter2) {
			const Duty* duty = *dutyIter2;
			Duty::DUTY_TYPE dutyType = duty->getType();
			if ((dutyType != Duty::DUTY_PAIRING_REST) && (dutyType != Duty::DUTY_BLANK_DAY))
			{
				std::unique_ptr<WorkPeriod> workPeriod = std::make_unique<WorkPeriod>();
				workPeriod->SetWorkType(WorkType::FltDuty);
				workPeriod->SetKey(StringUtils::lltos(duty->getDutyId()));
				workPeriod->SetWork(duty);
				workPeriod->SetRoster(roster);
				workPeriod->SetStartTimeUTC(SchDutyUtils::GetDutySchStartTimeUtc(duty) - duty->getMinPickup() * 60);
				workPeriod->SetEndTimeUTC(SchDutyUtils::GetDutySchEndTimeUtc(duty) + duty->getMinDropoff() * 60);

				workPeriod->SetStartTimeLoc(SchDutyUtils::GetDutySchStartTimeLoc(duty) - duty->getMinPickup() * 60);
				workPeriod->SetEndTimeLoc(SchDutyUtils::GetDutySchEndTimeLoc(duty) + duty->getMinDropoff() * 60);

				//work->needRuleCheck = roster->needRuleCheck;

				if (roster->source == "PA") {
					workPeriod->SetSource(RosterSource::PA);
				}
				workPeriods.push_back(std::move(workPeriod));
			}
		}
	}

	//按开始时间排序
	std::stable_sort(workPeriods.begin(), workPeriods.end(),
		[](const std::unique_ptr<WorkPeriod>& src, const std::unique_ptr<WorkPeriod>& dest)->int {
			return src->GetStartTimeUTC() < dest->GetStartTimeUTC();
		}
	);
	return std::move(workPeriods);
}

std::vector<std::unique_ptr<WorkPeriod>> WorkPeriod::GetWorkFDPPeriodsBySch(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CrewDataContext>& dbData) {
	std::vector<std::unique_ptr<WorkPeriod>> workPeriods;
	for (std::vector<const ROSTER*>::const_iterator rosterIter2 = rosters.begin(); rosterIter2 != rosters.end(); ++rosterIter2)
	{
		const ROSTER* roster = *rosterIter2;
		string rosterAsnment = roster->duty;
		Pairing* pg = roster->pairing;

		//休息类任务忽略掉
		if (RuleParams::GetInstancePtr()->isRestAssignment(roster->qualifier, roster->duty))
			continue;
		//休假任务忽略掉
		if (AssignmentUtils::IsLeaveAssignment(rosterAsnment))
			continue;

		if (pg == nullptr)
		{
			//地面任务工作时间
			std::unique_ptr<WorkPeriod> workPeriod = std::make_unique<WorkPeriod>();
			workPeriod->SetWorkType(WorkType::GroundRoster);
			workPeriod->SetKey(StringUtils::lltos(roster->rosterId));
			workPeriod->SetWork(roster);
			workPeriod->SetRoster(roster);
			workPeriod->SetStartTimeUTC(roster->actStrUtc);
			workPeriod->SetEndTimeUTC(roster->actRestStrUtc);
			workPeriod->SetStartTimeLoc(roster->actStrLoc);
			workPeriod->SetEndTimeLoc(roster->actRestStrLoc);
			workPeriod->SetStartStation(roster->location);
			workPeriod->SetEndStation(roster->location);

			//work->endUtcTime = (*ix)->actRestStrUtc;
			//work->needRuleCheck = (*ix)->needRuleCheck;
			if (roster->source == "PA") {
				workPeriod->SetSource(RosterSource::PA);
			}
			workPeriods.push_back(std::move(workPeriod));
			continue;
		}

		//TODO ????
		CalculationManday REST = dbData->getCalculationManday("RESTGAP");

		const vector<Duty*> dutys = pg->getDutyVec();
		for (std::vector<Duty*>::const_iterator dutyIter2 = dutys.begin(); dutyIter2 != dutys.end(); ++dutyIter2) {
			const Duty* duty = *dutyIter2;
			Duty::DUTY_TYPE dutyType = duty->getType();
			if ((dutyType != Duty::DUTY_PAIRING_REST) && (dutyType != Duty::DUTY_BLANK_DAY))
			{
				std::unique_ptr<WorkPeriod> workPeriod = std::make_unique<WorkPeriod>();
				workPeriod->SetWorkType(WorkType::FltDuty);
				workPeriod->SetKey(StringUtils::lltos(duty->getDutyId()));
				workPeriod->SetWork(duty);
				workPeriod->SetRoster(roster);
				workPeriod->SetStartTimeUTC(SchDutyUtils::GetDutySchStartTimeUtc(duty) - duty->getActualPickupMin() * 60);
				workPeriod->SetEndTimeUTC(SchDutyUtils::GetDutySchEndTimeUtc(duty) + duty->getActualDropoffMin() * 60);

				workPeriod->SetStartTimeLoc(SchDutyUtils::GetDutySchStartTimeLoc(duty) - duty->getMinPickup() * 60);
				workPeriod->SetEndTimeLoc(SchDutyUtils::GetDutySchEndTimeUtc(duty) + duty->getMinDropoff() * 60);
				workPeriod->SetFDPStartTimeUTC(duty->getFDPSchStartUtcTimes());
				workPeriod->SetFDPEndTimeUTC(duty->getFDPSchEndUtcTimes());

				workPeriod->SetStartStation(duty->getDepartureStation());
				workPeriod->SetEndStation(duty->getArrivalStation());

				//work->needRuleCheck = roster->needRuleCheck;

				if (roster->source == "PA") {
					workPeriod->SetSource(RosterSource::PA);
				}
				workPeriods.push_back(std::move(workPeriod));
			}
		}
	}

	//按开始时间排序
	std::stable_sort(workPeriods.begin(), workPeriods.end(),
		[](const std::unique_ptr<WorkPeriod>& src, const std::unique_ptr<WorkPeriod>& dest)->int {
			return src->GetStartTimeUTC() < dest->GetStartTimeUTC();
		}
	);
	return std::move(workPeriods);
}

//std::vector<std::unique_ptr<WorkPeriod>> WorkPeriod::GetWorkPeriods(const std::vector<const ROSTER*>& rosters, 
//	const std::vector<std::string>& dayOffAssignmentGroups, const bool isUtilizePostDutyRest,
//	const bool isCountBlankDay, const bool isUltilizeLayover,
//	std::shared_ptr<CrewDataContext> dbData) {
//	std::vector<std::unique_ptr<WorkPeriod>> workPeriods;
//	for (std::vector<const ROSTER*>::const_iterator rosterIter = rosters.begin(); rosterIter != rosters.end(); ++rosterIter)
//	{
//		string rosterAsnment = (*rosterIter)->duty;
//		Pairing * pg = (*rosterIter)->pairing;
//
//		//休息类任务忽略掉
//		if (RuleParams::GetInstancePtr()->isRestAssignment(rosterAsnment))
//			continue;
//		if (pg == nullptr)
//		{
//			//地面任务工作时间
//			std::unique_ptr<WorkPeriod> workPeriod = std::make_unique<WorkPeriod>();
//			workPeriod->SetStartTimeUTC((*rosterIter)->actStrUtc);
//			workPeriod->SetEndTimeUTC((*rosterIter)->actRestStrUtc);
//			workPeriod->SetStartTimeLoc((*rosterIter)->actStrLoc);
//			workPeriod->SetEndTimeLoc((*rosterIter)->actRestStrLoc);
//			//work->endUtcTime = (*ix)->actRestStrUtc;
//			//work->needRuleCheck = (*ix)->needRuleCheck;
//			workPeriods.push_back(std::move(workPeriod));
//			continue;
//		}
//
//		if (isUltilizeLayover) {
//			//TODO ????
//			CalculationManday REST = dbData->getCalculationManday("RESTGAP");
//
//			const vector<Duty*> dutys = pg->getDutyVec();
//			for (std::vector<Duty*>::const_iterator dutyIter = dutys.begin(); dutyIter != dutys.end(); ++dutyIter) {
//				Duty::DUTY_TYPE dutyType = (*dutyIter)->getType();
//				if ((dutyType != Duty::DUTY_PAIRING_REST) && (dutyType != Duty::DUTY_BLANK_DAY))
//				{
//					std::unique_ptr<WorkPeriod> workPeriod = std::make_unique<WorkPeriod>();
//					workPeriod->SetStartTimeUTC((*dutyIter)->getStartTimeUtc(REST.str) - (*dutyIter)->getActualPickupMin() * 60);
//					workPeriod->SetEndTimeUTC((*dutyIter)->getEndTimeUtc(REST.end) + (*dutyIter)->getActualDropoffMin() * 60);
//
//					workPeriod->SetStartTimeLoc((*dutyIter)->getStartTimeLoc(REST.str) - (*dutyIter)->getActualPickupMin() * 60);
//					workPeriod->SetEndTimeLoc((*dutyIter)->getEndTimeLoc(REST.end) + (*dutyIter)->getActualDropoffMin() * 60);
//
//					//work->needRuleCheck = (*rosterIter)->needRuleCheck;
//					workPeriods.push_back(std::move(workPeriod));
//				}
//			}
//		}
//
//	}
//
//	//按开始时间排序
//	std::stable_sort(workPeriods.begin(), workPeriods.end(),
//		[](const std::unique_ptr<WorkPeriod>& src, const std::unique_ptr<WorkPeriod>& dest)->int {
//		return src->GetStartTimeUTC() < dest->GetStartTimeUTC();
//	}
//	);
//	return std::move(workPeriods);
//}

bool WorkPeriod::IsAllPreAssign(const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods) {
	bool isAllPreAssign = true;
	if (workPeriods.empty()) {
		return false;
	}
	for (auto& workPeriod : workPeriods) {
		if (workPeriod->GetSource() != RosterSource::PA) {
			isAllPreAssign = false;
			break;
		}
	}
	return isAllPreAssign;
}

bool WorkPeriod::Slide(const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods,
	const unsigned int& windowSize, const std::string& slideUnit, const SlideListener& slideListener) {
	bool isValid = true;

	//转化成分钟
	//unsigned int maxPeriodMinutes = windowSize * 24 * 60;
	unsigned int windowSlideMinutesSize = 24 * 60; //滑动窗口步长（按天），单位：分钟

	//检查的开始时间和结束时间
	time_t startTime = workPeriods[0]->GetStartTimeUTC();
	time_t endTime = workPeriods[workPeriods.size() - 1]->GetEndTimeUTC();

	int startIndex = 0;
	time_t windowSlideSize = windowSlideMinutesSize * 60; //滑动窗口步长（单位秒）(按小时或按天滚动)
	//windowStart 窗口开始时间，windowEnd 窗口结束时间
	for (time_t windowStart = startTime; windowStart < endTime; windowStart += windowSlideSize) {
		time_t windowEnd = windowStart + windowSize * windowSlideSize;

		//检查滑动窗口[windowStart,windowEnd]是否违规
		if (!Slide(startIndex, workPeriods,	windowStart, windowEnd, windowSlideSize, slideListener)) {
			//违规则退出
			isValid = false;
			break;
		}
	}
	return isValid;
}


bool WorkPeriod::Slide(int& startIndex, const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods,
	const time_t& windowStart, const time_t& windowEnd, const time_t& windowSlideSize, const SlideListener& slideListener) {

	bool isValid = false;
	bool next = false;
	bool ignoreSlide = false;
	for (int i = startIndex; i < (int)workPeriods.size() - 2; i++) {
		auto& currWorkPeriod = workPeriods[i];
		auto& nextWorkPeriod = workPeriods[i + 1];
		if (windowStart <= currWorkPeriod->GetEndTimeUTC()
			&& currWorkPeriod->GetEndTimeUTC() <= (windowStart + windowSlideSize)) {
			startIndex = i;
		}

		if (currWorkPeriod->GetStartTimeUTC() > windowEnd) {
			//开始时间超出滑动窗口范围，则退出
			break;
		}

		//当前workPeriod在滚动窗口范围内。
		if (IsSlideWindow(*currWorkPeriod, windowStart, windowEnd)) {
			//int consecutiveMinutesPerPeriod = nextWorkPeriod->GetStartTimeUTC() - currWorkPeriod->GetEndTimeUTC();
			//if (consecutiveMinutesPerPeriod < 0) {
			//	//spdlog::error("error consecutiveMinutesPerPeriod:{}", consecutiveMinutesPerPeriod);
			//	continue;
			//}
			//TODO 回调
			if (!slideListener.OnSlide(next, ignoreSlide, currWorkPeriod.get(), nextWorkPeriod.get(), windowStart, windowEnd, 0, nullptr)) {
				break;
			}
		}
	}
	return isValid;
}

bool WorkPeriod::IsSlideWindow(const WorkPeriod& workPeriod, const time_t& windowStart, const time_t& windowEnd) {
	//使用结束时间在滚动时间窗口中来判断是否在滑动窗口内是合适？？？？
	return workPeriod.GetEndTimeUTC() >= windowStart && workPeriod.GetEndTimeUTC() <= windowEnd;
}