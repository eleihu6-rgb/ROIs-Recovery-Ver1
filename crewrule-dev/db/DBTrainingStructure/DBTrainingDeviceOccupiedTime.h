//
// Created by haoli on 2025/7/3.
//

#ifndef TRAININGOPTIMIZER_DBTRAININGDEVICEOCCUPIEDTIME_H
#define TRAININGOPTIMIZER_DBTRAININGDEVICEOCCUPIEDTIME_H


class DBTrainingDeviceOccupiedTime {
public:
    DBTrainingDeviceOccupiedTime(long long deviceId, long long startTime, long long endTime, unsigned int count, std::string status)
            : _deviceId(deviceId), _startTime(startTime), _endTime(endTime), _count(count), _status(std::move(status)) {}

    const long long GetDeviceId() const { return _deviceId; }

    void SetDeviceId(long long id) { _deviceId = id; }

    const long long GetStartTime() const { return _startTime; }

    void SetStartTime(long long time) { _startTime = time; }

    const long long GetEndTime() const { return _endTime; }

    void SetEndTime(long long time) { _endTime = time; }

    const unsigned int GetCount() const { return _count; }

    void SetCount(unsigned int count) { _count = count; }

    const std::string &GetStatus() const { return _status; }

    void SetStatus(std::string status) { _status = std::move(status); }

    bool IsPreAssigned() const { return _isPreAssigned; }

    void SetIsPreAssigned(bool pa) { _isPreAssigned = pa; }

    time_t GetStartTimeUtc() const { return _startTimeUtc; }

    void SetStartTimeUtc(time_t time) { _startTimeUtc = time; }

    time_t GetEndTimeUtc() const { return _endTimeUtc; }

    void SetEndTimeUtc(time_t time) { _endTimeUtc = time; }

    time_t GetStartTimeLoc() const { return _startTimeLoc; }

    void SetStartTimeLoc(time_t time) { _startTimeLoc = time; }

    time_t GetEndTimeLoc() const { return _endTimeLoc; }

    void SetEndTimeLoc(time_t time) { _endTimeLoc = time; }

    [[nodiscard]] const std::unordered_set<std::string> &GetCourseCodes() const { return _courseCodes; }

    [[nodiscard]] const std::unordered_set<std::string> &GetFootprintNames() const { return _footprintNames; }

    void SetCourseCodes(const std::unordered_set<std::string> &courseCodes) { _courseCodes = courseCodes; }

    void SetFootprintNames(const std::unordered_set<std::string> &footprintNames) { _footprintNames = footprintNames; }
private:

    bool _isPreAssigned{true};
    std::string _status;        //取值：N：不可用，U_O:手动占用 U_F:SIM航班占用 U_R:排班占用 U_B:Booking， ALL或空: 可用
    long long _deviceId;
    long long _startTime;       //UTC timestamp Start of period
    long long _endTime;         //UTC timestamp End of period
    unsigned int _count;        //Strictly greater than 0.
                                //Roster may not be import into current training optimizer scenarios, TO only use this as device availability indicator instead calculating itself
    time_t _startTimeUtc;
    time_t _endTimeUtc;
    time_t _startTimeLoc;
    time_t _endTimeLoc;
    std::unordered_set<std::string> _courseCodes;
    std::unordered_set<std::string> _footprintNames;
};


#endif //TRAININGOPTIMIZER_DBTRAININGDEVICEOCCUPIEDTIME_H
