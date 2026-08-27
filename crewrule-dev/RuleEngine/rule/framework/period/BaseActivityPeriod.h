#ifndef _BASEACTIVITYPERIOD_H_
#define _BASEACTIVITYPERIOD_H_

#include <vector>
#include <memory>
#include "CrewDB.h"

class BaseActivityPeriod {
public:

	inline void SetStartTimeUtc(const time_t startTimeUtc) {
		_startTimeUtc = startTimeUtc;
	}

	inline time_t GetStartTimeUtc() const {
		return _startTimeUtc;
	}

	inline void SetEndTimeUtc(const time_t endTimeUtc) {
		_endTimeUtc = endTimeUtc;
	}

	inline time_t GetEndTimeUtc() const {
		return _endTimeUtc;
	}

	inline void SetStartTimeLoc(const time_t startTimeLoc) {
		_startTimeLoc = startTimeLoc;
	}

	inline time_t GetStartTimeLoc() const {
		return _startTimeLoc;
	}

	inline void SetEndTimeLoc(const time_t endTimeLoc) {
		_endTimeLoc = endTimeLoc;
	}

	inline time_t GetEndTimeLoc() const {
		return _endTimeLoc;
	}

	inline void SetActivity(const Activity* activity) {
		_activity = const_cast<Activity*>(activity);
	}

	inline Activity* GetActivity() const {
		return _activity;
	}

	inline void SetDuty(const Duty* duty) {
		_duty = const_cast<Duty*>(duty);
	}

	inline Duty* GetDuty() const {
		return _duty;
	}

	inline void SetRoster(const ROSTER* roster) {
		_roster = const_cast<ROSTER*>(roster);
	}

	inline ROSTER* GetRoster() const {
		return _roster;
	}

public:
	//activity的颗粒都到：Duty或GroudRoster
	static vector<shared_ptr<BaseActivityPeriod>> GetActivityPeriodsOfDuty(const std::vector<const ROSTER*>& rosters);
	static vector<shared_ptr<BaseActivityPeriod>> GetActivityPeriodsOfDuty(const Pairing* pairing, const ROSTER* roster = nullptr);
	static shared_ptr<BaseActivityPeriod> GetActivityPeriodOfDuty(const Duty* duty, const ROSTER* roster = nullptr);
	static shared_ptr<BaseActivityPeriod> GetActivityPeriodOfDuty(const ROSTER* groundRoster);

	//activity的颗粒都到：Segment或GroudRoster
	static vector<shared_ptr<BaseActivityPeriod>> GetActivityPeriodsOfSegment(const std::vector<const ROSTER*>& rosters);
	static vector<shared_ptr<BaseActivityPeriod>> GetActivityPeriodsOfSegment(const Pairing* pairing, const ROSTER* roster = nullptr);
	static vector<shared_ptr<BaseActivityPeriod>> GetActivityPeriodsOfSegment(const Duty* duty, const ROSTER* roster = nullptr);
	static shared_ptr<BaseActivityPeriod> GetActivityPeriodOfSegment(const ROSTER* groundRoster);

public:

	inline bool isOverlapWithLoc(const time_t windowStartTimeLoc, const time_t windowsEndTimeLoc) const {
		time_t startTimeLoc = this->GetStartTimeLoc();
		time_t endTimeLoc = this->GetEndTimeLoc();
		return (startTimeLoc >= windowStartTimeLoc && startTimeLoc <= windowsEndTimeLoc) ||
			(endTimeLoc >= windowStartTimeLoc && endTimeLoc <= windowsEndTimeLoc) ||
			(windowStartTimeLoc >= startTimeLoc && windowStartTimeLoc <= endTimeLoc) ||
			(windowsEndTimeLoc >= startTimeLoc && windowsEndTimeLoc <= endTimeLoc);
	}

	inline bool isOverlapWithLoc(const time_t windowStartTimeLoc, const time_t windowsEndTimeLoc, const int offsetTZMinutes) const {
		time_t startTimeLoc = this->GetStartTimeUtc() + (time_t)offsetTZMinutes * 60;
		time_t endTimeLoc = this->GetEndTimeUtc() + (time_t)offsetTZMinutes * 60;
		return (startTimeLoc >= windowStartTimeLoc && startTimeLoc <= windowsEndTimeLoc) ||
			(endTimeLoc >= windowStartTimeLoc && endTimeLoc <= windowsEndTimeLoc) ||
			(windowStartTimeLoc >= startTimeLoc && windowStartTimeLoc <= endTimeLoc) ||
			(windowsEndTimeLoc >= startTimeLoc && windowsEndTimeLoc <= endTimeLoc);
	}

	inline bool isOverlapWithUtc(const time_t windowStartTimeUtc, const time_t windowsEndTimeUtc) const {
		time_t startTimeUtc = this->GetStartTimeUtc();
		time_t endTimeUtc = this->GetEndTimeUtc();
		return (startTimeUtc >= windowStartTimeUtc && startTimeUtc <= windowsEndTimeUtc) ||
			(endTimeUtc >= windowStartTimeUtc && endTimeUtc <= windowsEndTimeUtc) ||
			(windowStartTimeUtc >= startTimeUtc && windowStartTimeUtc <= endTimeUtc) ||
			(windowsEndTimeUtc >= startTimeUtc && windowsEndTimeUtc <= endTimeUtc);
	}
private:
	Activity* _activity = nullptr;////Pairing、Duty、Segment或Ground Roster(不同接口颗粒度不同)

	Duty* _duty = nullptr;

	ROSTER* _roster = nullptr;

	time_t _startTimeUtc = 0;
	time_t _endTimeUtc = 0;
	time_t _startTimeLoc = 0;
	time_t _endTimeLoc = 0;
};

#endif //_BASEACTIVITYPERIOD_H_