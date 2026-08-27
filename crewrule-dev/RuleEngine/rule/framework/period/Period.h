#ifndef _NEWRULEENGINE_PERIOD_H_
#define _NEWRULEENGINE_PERIOD_H_

#include <string>


class Period {
public:
	inline void SetStartTimeUTC(const time_t startTimeUtc) {
		_startTimeUtc = startTimeUtc;
	}

	inline time_t GetStartTimeUTC() const {
		return _startTimeUtc;
	}

	inline void SetEndTimeUTC(const time_t endTimeUtc) {
		_endTimeUtc = endTimeUtc;
	}

	inline time_t GetEndTimeUTC() const {
		return _endTimeUtc;
	}

	inline void SetFDPStartTimeUTC(const time_t startTimeUtc) {
		_fdpStartTimeUtc = startTimeUtc;
	}

	inline time_t GetFDPStartTimeUTC() const {
		return _fdpStartTimeUtc;
	}

	inline void SetFDPEndTimeUTC(const time_t endTimeUtc) {
		_fdpEndTimeUtc = endTimeUtc;
	}

	inline time_t GetFDPEndTimeUTC() const {
		return _fdpEndTimeUtc;
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

	inline void SetFDPStartTimeLoc(const time_t startTimeLoc) {
		_fdpStartTimeLoc = startTimeLoc;
	}

	inline time_t GetFDPStartTimeLoc() const {
		return _fdpStartTimeLoc;
	}

	inline void SetFDPEndTimeLoc(const time_t endTimeLoc) {
		_fdpEndTimeLoc = endTimeLoc;
	}

	inline time_t GetFDPEndTimeLoc() const {
		return _fdpEndTimeLoc;
	}

	inline void SetStartStation(const std::string& start) {
		_startStation = start;
	}

	inline std::string GetStartStation() const {
		return _startStation;
	}

	inline void SetEndStation(const std::string& end) {
		_endStation = end;
	}

	inline std::string GetEndStation() const {
		return _endStation;
	}

	inline void SetAccTimezoneAtStart(const int accTimezoneAtStart) {
		_accTimezoneAtStart = accTimezoneAtStart;
	}

	inline int GetAccTimezoneAtStart() const {
		return _accTimezoneAtStart;
	}

	static int GetPeriodUnitSize(const std::string& timePeriodUnit);
private:
	time_t _startTimeUtc;
	time_t _endTimeUtc;
	time_t _startTimeLoc;
	time_t _endTimeLoc;
	time_t _fdpStartTimeUtc;
	time_t _fdpEndTimeUtc;
	time_t _fdpStartTimeLoc;
	time_t _fdpEndTimeLoc;
	int _accTimezoneAtStart = -1;//休息开始时的适应时区
	std::string _startStation;
	std::string _endStation;
};



class WindowTime : public Period {

};

#endif //_NEWRULEENGINE_PERIOD_H_