#ifndef _NEWRULEENGINE_SEGMENTPERIOD_H_
#define _NEWRULEENGINE_SEGMENTPERIOD_H_

#include <vector>
#include <memory>
#include "CrewDB.h"
#include "Period.h"
#include "SlideListener.h"

class SegmentPeriod : public Period {
public:

	void SetSegment(Segment* segment) {
		_segment = segment;
	}

	Segment* GetSegment() const {
		return _segment;
	}

	void SetDuty(Duty* duty) {
		_duty = duty;
	}

	Duty* GetDuty() const {
		return _duty;
	}

	void SetPairing(Pairing* pairing) {
		_pairing = pairing;
	}

	Pairing* GetPairing() const {
		return _pairing;
	}

	/**
	* 获得基于Segment时间的时间段列表
	* @param: rosters 员工排班列表
	* @param: dbData 数据模块
	* @return
	*/
	static std::vector<std::unique_ptr<Period>> GetSegmentPeriods(const std::vector<const ROSTER*>& rosters,
		const std::shared_ptr<CrewDataContext>& dbData);


	static std::vector<std::unique_ptr<Period>> GetSegmentPeriods(const Pairing* pairing, const std::shared_ptr<CrewDataContext>& dbData);


private:

	Pairing* _pairing = nullptr;

	Duty* _duty = nullptr;

	Segment* _segment = nullptr;

	static std::vector<std::unique_ptr<Period>> GetSegmentPeriods(const Pairing* pairing, const vector<Duty*>& duties,
		const std::shared_ptr<CrewDataContext>& dbData);


};


#endif //_NEWRULEENGINE_SEGMENTPERIOD_H_