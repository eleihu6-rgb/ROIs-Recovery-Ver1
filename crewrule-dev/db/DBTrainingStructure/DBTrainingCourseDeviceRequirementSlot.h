//
// Created by haoli on 2025/7/3.
//

#ifndef TRAININGOPTIMIZER_DBTRAININGCOURSEDEVICEREQUIREMENTSLOT_H
#define TRAININGOPTIMIZER_DBTRAININGCOURSEDEVICEREQUIREMENTSLOT_H


class DBTrainingCourseDeviceRequirementSlot {
public:
    DBTrainingCourseDeviceRequirementSlot(long long deviceRequirementId, long long deviceId, time_t earlyStartTimeLoc,
                                          time_t lateEndTimeLoc, time_t duration) :
            _deviceRequirementId(deviceRequirementId), _deviceId(deviceId), _earlyStartTimeLoc(earlyStartTimeLoc),
            _lateEndTimeLoc(lateEndTimeLoc), _duration(duration) {}

    const long long GetDeviceRequirementId() const { return _deviceRequirementId; }

    void SetDeviceRequirementId(long long id) { _deviceRequirementId = id; }

    const long long GetDeviceId() const { return _deviceId; }

    void SetDeviceId(long long deviceId) { _deviceId = deviceId; }

    const time_t GetEarlyStartTimeLoc() const { return _earlyStartTimeLoc; }

    void SetEarlyStartTimeLoc(time_t earlyStartTimeLoc) { _earlyStartTimeLoc = earlyStartTimeLoc; }

    const time_t GetLateEndTimeLoc() const { return _lateEndTimeLoc; }

    void SetLateEndTimeLoc(time_t lateEndTimeLoc) { _lateEndTimeLoc = lateEndTimeLoc; }

    const time_t GetDuration() const { return _duration; }

    void SetDuration(time_t duration) { _duration = duration; }

private:
    long long _deviceRequirementId;
    long long _deviceId;
    time_t _earlyStartTimeLoc;           //Unit: Seconds, transformed from HH:MM(time of a day). If empty: 00:00
    time_t _lateEndTimeLoc;              //Unit: Seconds, transformed from HH:MM(time of a day). If empty: 23:59
    time_t _duration;                    //Unit: Seconds
};


#endif //TRAININGOPTIMIZER_DBTRAININGCOURSEDEVICEREQUIREMENTSLOT_H
