#include "WorkPeriod.h"

#include <algorithm>
#include "Duty.h"
#include "BaseActivityPeriod.h"

vector<shared_ptr<BaseActivityPeriod>> BaseActivityPeriod::GetActivityPeriodsOfDuty(const std::vector<const ROSTER*>& rosters) {
	vector<shared_ptr<BaseActivityPeriod>> activityPeriods;
	for (auto& roster : rosters) {
		if (roster->pairing == nullptr) {
			activityPeriods.emplace_back(GetActivityPeriodOfDuty(roster));
			continue;
		}
		auto& duties = roster->pairing->getDutyVec();
		for (auto duty : duties) {
			activityPeriods.emplace_back(GetActivityPeriodOfDuty(duty, roster));
		}
	}
	return activityPeriods;
}

vector<shared_ptr<BaseActivityPeriod>> BaseActivityPeriod::GetActivityPeriodsOfDuty(const Pairing* pairing, const ROSTER* roster) {
	vector<shared_ptr<BaseActivityPeriod>> activityPeriods;
	auto& duties = pairing->getDutyVec();
	for (auto duty : duties) {
		auto activityPeriod = make_shared<BaseActivityPeriod>();
		activityPeriod->SetRoster(roster);
		activityPeriod->SetDuty(duty);
		activityPeriod->SetActivity(duty);
		activityPeriod->SetStartTimeUtc(duty->getStartTimeUtcAct());
		activityPeriod->SetEndTimeUtc(duty->getEndTimeUtcAct());
		activityPeriod->SetStartTimeLoc(duty->getStartTimeLocAct());
		activityPeriod->SetEndTimeLoc(duty->getEndTimeLocAct());
		activityPeriods.emplace_back(activityPeriod);
	}
	return activityPeriods;
}

shared_ptr<BaseActivityPeriod> BaseActivityPeriod::GetActivityPeriodOfDuty(const Duty* duty, const ROSTER* roster) {
	auto activityPeriod = make_shared<BaseActivityPeriod>();
	activityPeriod->SetRoster(roster);
	activityPeriod->SetDuty(duty);
	activityPeriod->SetActivity(duty);
	activityPeriod->SetStartTimeUtc(duty->getStartTimeUtcAct());
	activityPeriod->SetEndTimeUtc(duty->getEndTimeUtcAct());
	activityPeriod->SetStartTimeLoc(duty->getStartTimeLocAct());
	activityPeriod->SetEndTimeLoc(duty->getEndTimeLocAct());
	return activityPeriod;
}

shared_ptr<BaseActivityPeriod> BaseActivityPeriod::GetActivityPeriodOfDuty(const ROSTER* groundRoster) {
	auto activityPeriod = make_shared<BaseActivityPeriod>();
	activityPeriod->SetRoster(groundRoster);
	activityPeriod->SetActivity(groundRoster);
	activityPeriod->SetStartTimeUtc(groundRoster->getStartTimeUtcAct());
	activityPeriod->SetEndTimeUtc(groundRoster->getRestStartUtcAct());
	activityPeriod->SetStartTimeLoc(groundRoster->getStartTimeLocAct());
	activityPeriod->SetEndTimeLoc(groundRoster->getRestStartLocAct());
    return activityPeriod;
}


vector<shared_ptr<BaseActivityPeriod>> BaseActivityPeriod::GetActivityPeriodsOfSegment(const std::vector<const ROSTER*>& rosters) {
	vector<shared_ptr<BaseActivityPeriod>> activityPeriods;
	for (auto& roster : rosters) {
		if (roster->pairing == nullptr) {
			activityPeriods.emplace_back(GetActivityPeriodOfSegment(roster));
			continue;
		}
		auto periods = GetActivityPeriodsOfSegment(roster->pairing, roster);
		activityPeriods.insert(activityPeriods.end(), periods.begin(), periods.end());
	}

	//按开始时间排序
	std::stable_sort(activityPeriods.begin(), activityPeriods.end(),
		[](const shared_ptr<BaseActivityPeriod>& src, const shared_ptr<BaseActivityPeriod>& dest)->int {
			return src->GetStartTimeUtc() < dest->GetStartTimeUtc();
		}
	);
	return activityPeriods;
}

vector<shared_ptr<BaseActivityPeriod>> BaseActivityPeriod::GetActivityPeriodsOfSegment(const Pairing* pairing, const ROSTER* roster) {
	vector<shared_ptr<BaseActivityPeriod>> activityPeriods;
	auto& duties = pairing->getDutyVec();
	for (auto duty : duties) {
		auto periods = GetActivityPeriodsOfSegment(duty, roster);
		activityPeriods.insert(activityPeriods.end(), periods.begin(), periods.end());
	}
	return activityPeriods;
}

vector<shared_ptr<BaseActivityPeriod>> BaseActivityPeriod::GetActivityPeriodsOfSegment(const Duty* duty, const ROSTER* roster) {
	vector<shared_ptr<BaseActivityPeriod>> activityPeriods;
	for(auto& segment : duty->getSegmentsRead()) {
		auto activityPeriod = make_shared<BaseActivityPeriod>();
		activityPeriod->SetRoster(roster);
		activityPeriod->SetDuty(duty);
		activityPeriod->SetActivity(segment);
		activityPeriod->SetStartTimeUtc(segment->getStartTimeUtcAct());
		activityPeriod->SetEndTimeUtc(segment->getEndTimeUtcAct());
		activityPeriod->SetStartTimeLoc(segment->getStartTimeLocAct());
		activityPeriod->SetEndTimeLoc(segment->getEndTimeLocAct());
		activityPeriods.emplace_back(activityPeriod);
	}
	return activityPeriods;
}

shared_ptr<BaseActivityPeriod> BaseActivityPeriod::GetActivityPeriodOfSegment(const ROSTER* groundRoster) {
	auto activityPeriod = make_shared<BaseActivityPeriod>();
	activityPeriod->SetRoster(groundRoster);
	activityPeriod->SetActivity(groundRoster);
	activityPeriod->SetStartTimeUtc(groundRoster->getStartTimeUtcAct());
	activityPeriod->SetEndTimeUtc(groundRoster->getRestStartUtcAct());
	activityPeriod->SetStartTimeLoc(groundRoster->getStartTimeLocAct());
	activityPeriod->SetEndTimeLoc(groundRoster->getRestStartLocAct());
	return activityPeriod;
}